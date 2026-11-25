-- Alicerce Run: ranking e leads.
-- Padrao do portal SUAS Facil: insert validado para anon, nada de service role no front.

-- =========================================================
-- Tabela de ranking (pontuacoes exibidas no evento)
-- =========================================================
create table if not exists public.ranking (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  orgao text,
  cargo text,
  pontos integer not null default 0,
  municipios integer not null default 0,
  evento text not null default 'demonstracao',
  created_at timestamptz not null default now(),
  constraint ranking_nome_len check (char_length(nome) between 1 and 60),
  constraint ranking_orgao_len check (orgao is null or char_length(orgao) <= 80),
  constraint ranking_cargo_len check (cargo is null or char_length(cargo) <= 80),
  constraint ranking_evento_len check (char_length(evento) between 1 and 60),
  constraint ranking_pontos_range check (pontos between 0 and 2000000),
  constraint ranking_municipios_range check (municipios between 0 and 100000)
);

create index if not exists ranking_evento_pontos_idx
  on public.ranking (evento, pontos desc);

-- =========================================================
-- Tabela de leads (contatos que deram consentimento LGPD)
-- =========================================================
create table if not exists public.lead (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text not null,
  orgao text,
  cargo text,
  consentimento_lgpd boolean not null default false,
  evento text not null default 'demonstracao',
  pontos integer not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_nome_len check (char_length(nome) between 1 and 60),
  constraint lead_contato_len check (char_length(contato) between 3 and 120),
  constraint lead_consent check (consentimento_lgpd = true)
);

-- =========================================================
-- RLS: anon so pode INSERIR. Nunca ler as tabelas base.
-- =========================================================
alter table public.ranking enable row level security;
alter table public.lead enable row level security;

drop policy if exists ranking_insert_anon on public.ranking;
create policy ranking_insert_anon
  on public.ranking for insert
  to anon
  with check (
    char_length(nome) between 1 and 60
    and pontos between 0 and 2000000
  );

drop policy if exists lead_insert_anon on public.lead;
create policy lead_insert_anon
  on public.lead for insert
  to anon
  with check (consentimento_lgpd = true);

-- =========================================================
-- View de leitura publica do ranking (top por evento).
-- A view roda com privilegios do dono e nao expoe dados pessoais
-- sensiveis nem a tabela de leads.
-- =========================================================
create or replace view public.v_ranking_top as
  select nome, orgao, cargo, pontos, municipios, evento, created_at
  from public.ranking;

grant select on public.v_ranking_top to anon, authenticated;
grant insert on public.ranking to anon;
grant insert on public.lead to anon;

-- Observacoes:
-- 1. A view publica expoe nome, orgao e cargo do ranking. Se nao quiser exibir
--    orgao/cargo publicamente, remova as colunas da view.
-- 2. A tabela lead nunca e lida pelo anon; consulte-a pelo painel do Supabase
--    ou via service role no backend do comercial.
-- 3. Para zerar o ranking de um evento:  delete from public.ranking where evento = 'xxx';
