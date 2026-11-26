-- Alicerce Run: ranking v2 (so nome; sem contato, orgao ou cargo).
-- Funciona num projeto novo e tambem em cima da migracao anterior
-- (20261125000001_alicerce_run.sql). Rode este arquivo inteiro no SQL Editor.
--
-- Seguranca: o front usa so a anon key. O visitante (anon) so consegue
-- INSERIR nas colunas do ranking e LER as colunas publicas pela view.
-- Nada de service role no front.

-- =========================================================
-- Tabela
-- =========================================================
create table if not exists public.ranking (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  pontos integer not null default 0,
  municipios integer not null default 0,
  personagem text,
  evento text not null default 'demonstracao',
  duracao_ms integer,
  created_at timestamptz not null default now()
);

-- colunas novas, para quem ja rodou a migracao anterior
alter table public.ranking add column if not exists personagem text;
alter table public.ranking add column if not exists duracao_ms integer;

create index if not exists ranking_evento_pontos_idx on public.ranking (evento, pontos desc);

-- =========================================================
-- Regras de validacao (recriadas). NOT VALID: valem para gravacoes novas,
-- sem travar por causa de linhas antigas.
-- =========================================================
alter table public.ranking drop constraint if exists ranking_nome_len;
alter table public.ranking drop constraint if exists ranking_evento_len;
alter table public.ranking drop constraint if exists ranking_pontos_range;
alter table public.ranking drop constraint if exists ranking_municipios_range;
alter table public.ranking drop constraint if exists ranking_personagem_valido;
alter table public.ranking drop constraint if exists ranking_duracao_range;
alter table public.ranking drop constraint if exists ranking_municipios_coerentes;
alter table public.ranking drop constraint if exists ranking_pontuacao_plausivel;

-- nome de 1 a 30 caracteres (sem contar espacos nas pontas)
alter table public.ranking add constraint ranking_nome_len
  check (char_length(btrim(nome)) between 1 and 30) not valid;

alter table public.ranking add constraint ranking_evento_len
  check (char_length(evento) between 1 and 60) not valid;

alter table public.ranking add constraint ranking_pontos_range
  check (pontos between 0 and 2000000) not valid;

alter table public.ranking add constraint ranking_personagem_valido
  check (personagem in ('gestora', 'analista', 'tecnico', 'secretaria', 'comercial')) not valid;

-- duracao da corrida (sem a contagem inicial), ate 1 hora
alter table public.ranking add constraint ranking_duracao_range
  check (duracao_ms is not null and duracao_ms between 0 and 3600000) not valid;

-- o jogo conecta 1 municipio a cada 400 pontos (TUNING.pointsPerMunicipio)
alter table public.ranking add constraint ranking_municipios_coerentes
  check (municipios = pontos / 400) not valid;

-- teto teorico do jogo: no maximo 1 item a cada 320 ms, valendo no maximo
-- 160 x 3 (indicador com combo maximo) = 1.500 pontos por segundo.
-- Pontuacao acima disso para o tempo jogado e recusada.
alter table public.ranking add constraint ranking_pontuacao_plausivel
  check (pontos <= (duracao_ms / 1000.0) * 1500 + 500) not valid;

-- =========================================================
-- Permissoes: visitante grava so as colunas do ranking e le so as publicas
-- =========================================================
alter table public.ranking enable row level security;

revoke all on public.ranking from anon, authenticated;
grant insert (nome, pontos, municipios, personagem, evento, duracao_ms) on public.ranking to anon;
grant select (nome, personagem, pontos, municipios, evento, created_at) on public.ranking to anon, authenticated;

drop policy if exists ranking_insert_anon on public.ranking;
create policy ranking_insert_anon
  on public.ranking for insert
  to anon
  with check (true); -- as regras acima (constraints) fazem a validacao

drop policy if exists ranking_select_publico on public.ranking;
create policy ranking_select_publico
  on public.ranking for select
  to anon, authenticated
  using (true);

-- =========================================================
-- View publica do ranking (respeita as permissoes de quem consulta)
-- =========================================================
drop view if exists public.v_ranking_top;
create view public.v_ranking_top
  with (security_invoker = true) as
  select nome, personagem, pontos, municipios, evento, created_at
  from public.ranking;

grant select on public.v_ranking_top to anon, authenticated;

-- =========================================================
-- Observacoes
-- 1. Leads (contato e consentimento) ficam para depois. Se a tabela "lead" da
--    migracao anterior existir, ela continua la e o jogo nao grava nada nela.
-- 2. Ver o ranking de um evento:
--      select nome, personagem, pontos, municipios, created_at
--      from public.ranking where evento = 'nome-do-evento' order by pontos desc;
-- 3. Remover uma linha indevida:  delete from public.ranking where id = '...';
-- 4. Zerar o ranking de um evento: delete from public.ranking where evento = '...';
