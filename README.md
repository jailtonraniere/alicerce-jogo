# Alicerce Run

Jogo web (endless runner) de ativação de marca da **Alicerce**, hub de tecnologia para gestão pública. Pensado para eventos do setor público: o visitante abre por QR code, corre coletando dados e conectando municípios ao mapa do estado, e pode entrar no ranking do evento deixando um contato. Roda no navegador, sem instalar.

Feito com Vite + TypeScript + Phaser 3. Ranking e leads no Supabase. Deploy na Vercel. Identidade visual marinho/ciano (Saira + IBM Plex Sans).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (porta 5173 por padrão). O jogo funciona sem backend: nesse modo o ranking fica salvo no navegador (localStorage) e nenhum lead é gravado.

## Protótipo 3D (em desenvolvimento)

A versão em produção continua sendo a 2D (Phaser). O protótipo 3D (Three.js) usa a mesma lógica, o mesmo `TUNING` e as mesmas telas, e abre com um parâmetro na URL:

- `http://localhost:5173/?3d` abre o jogo em 3D.
- `http://localhost:5173/?3d&debug` mostra também fps, draw calls e nível de qualidade no canto da tela.
- `&imune` (junto com `debug`) deixa o jogador imune a obstáculos, para avaliar cenário e efeitos.
- `&q=alto`, `&q=medio` ou `&q=baixo` fixa o nível de qualidade.

Personagens 3D: os 4 personagens são modelos da Quaternius (pacotes Ultimate Modular Men e Ultimate Modular Women, licença CC0), obtidos pelo Poly Pizza. Os originais ficam em `assets-src/quaternius/` e os arquivos do jogo em `public/models/`. Para regerar (mantém só as animações usadas, une cada personagem numa malha só e compacta): `node tools/build-characters.mjs`. As cores das roupas ficam nesse mesmo script (gravadas nos vértices); depois de mudar, rode-o de novo. Cada personagem só é baixado quando é escolhido; até carregar, aparece a cápsula provisória.

Tela de início no 3D: a logo da Alicerce aparece em metal escovado (extrudada da logo vetorizada em `public/logo/`) e cada personagem escolhido aparece em 3D, acenando ao ser selecionado, com o cenário rodando ao fundo. Se algo não carregar, a tela mostra a logo e o emoji de sempre.

Áudio no 3D: trilha e efeitos são sintetizados em tempo real (Web Audio, `src/engine3d/audio.ts`), sem arquivos de som nem licenças de terceiros. A trilha ganha camadas conforme a velocidade; no modo 2 jogadores, o som de cada um sai de um lado. O botão "Som" da tela de início liga e desliga tudo.

Qualidade automática: na primeira partida o jogo começa no nível médio, tenta o alto se o aparelho tiver folga e desce se ficar abaixo de 45 fps. O nível que funcionou fica salvo no aparelho. O alto usa antisserrilhado e mais resolução; o baixo desliga o brilho (bloom).

Para testar num celular na mesma rede, use o endereço "Network" que o Vite mostra ao rodar `npm run dev`, com `?3d&debug` no final. Cada motor é baixado só quando é usado, e se o aparelho não tiver WebGL o jogo cai para o 2D.

## Build e preview

```bash
npm run build     # checa tipos e gera dist/
npm run preview   # serve o build local
```

## Desempenho e cache offline

- **Cache offline:** no build de produção, um service worker (`public/sw.js`) guarda no aparelho tudo o que o jogo usou (página, motor, fontes, logo, personagens). Nas próximas visitas o jogo abre rápido e funciona mesmo sem rede. A página sempre busca a versão nova primeiro, então um novo deploy chega na próxima abertura com internet.
- **Cabeçalhos de cache:** o `vercel.json` marca os arquivos com hash (`/assets/`) como imutáveis e os personagens (`/models/`) com cache de um dia.
- **Medir no aparelho:** abra com `?3d&debug` para ver fps, tempo de CPU por quadro, draw calls, resolução interna e nível de qualidade no canto da tela.
- **Referência medida (PC com GPU integrada, Chrome):** 1 jogador a 60 fps e cerca de 40 draw calls; 2 jogadores a 56 a 60 fps e cerca de 65 draw calls. Com a CPU desacelerada 4 vezes (simulando um celular intermediário), 1 jogador fica entre 52 e 60 fps e 2 jogadores entre 37 e 52 fps. Falta medir em celulares reais.

## Configurar o Supabase (ranking e leads)

1. Crie um projeto no Supabase (ou reaproveite um existente).
2. Rode a migração `supabase/migrations/20261125000001_alicerce_run.sql` (SQL Editor ou CLI). Ela cria as tabelas `ranking` e `lead`, a RLS (anon só insere), a view pública `v_ranking_top` e os índices.
3. Copie `.env.example` para `.env.local` e preencha:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
VITE_EVENTO=congemas-2026
```

Use sempre a **anon key** (nunca a service role) no front. A segurança fica na RLS: o anônimo só consegue inserir pontuação e lead válidos, e lê apenas a view do ranking.

### Ver os leads

Os leads ficam na tabela `lead`, que o anônimo não lê. Consulte pelo painel do Supabase ou exporte via service role no backend do comercial. Só são gravados com consentimento LGPD explícito.

## Deploy na Vercel

1. Suba o repositório e importe na Vercel (framework Vite é detectado; `vercel.json` já define build e saída).
2. Em Settings > Environment Variables, adicione `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_EVENTO`.
3. Deploy. Gere um QR code apontando para a URL e leve ao estande.

## Como jogar

- **1 jogador:** deslize o dedo (ou use as setas / A D W S). Esquerda e direita trocam de pista, cima pula, baixo abaixa. Há botões na tela no celular.
- **2 jogadores:** tela dividida. Jogador 1 usa A D W S; jogador 2 usa as setas. No celular, cada um controla a sua metade por toque. Vence quem fizer mais pontos.
- **Coletar:** blocos de "dado" e "indicador" viram pontos e municípios conectados; acertos em sequência aumentam o combo.
- **Desviar:** obstáculos em laranja (planilha solta, dado desatualizado, recurso parado). Pule os baixos, abaixe nos altos, troque de pista nos blocos.
- **Power-ups:** 🛡 visão consolidada (escudo), 🧲 engenharia de dados (ímã), 🚀 recurso que flui (turbo).

## Estrutura

```
src/
  main.ts            orquestra as telas (DOM) e carrega o motor (2D ou 3D)
  engine.ts          contrato comum dos motores
  engine2d.ts        motor 2D (Phaser), versão em produção
  engine3d/          motor 3D (Three.js): cenário, holograma do mapa, itens, partículas,
                     brilho (bloom), níveis de qualidade, placar e controles
  sim/               lógica do jogo sem desenho, usada pelo 3D (porta do Runner.ts)
  config.ts          constantes, personagens, balanceamento, barramento de eventos
  theme.ts           tokens de cor e fontes da marca
  supabase.ts        ranking e leads (com fallback local)
  types.ts           tipos compartilhados
  style.css          estilo das telas de inicio e fim
  scenes/GameScene.ts  gameplay (1 e 2 jogadores)
  objects/Runner.ts    jogador, coleta, obstaculos, power-ups, pontuacao
  util/stateMap.ts     mapa do estado que conecta ao fundo
supabase/migrations/   SQL do ranking e leads
public/                favicon, logos da marca (SVG) e personagens 3D (models/)
assets-src/            arquivos originais dos personagens 3D
tools/                 scripts para preparar e inspecionar os modelos 3D
public/sw.js           service worker (cache offline, só no build de produção)
```

## Personalização rápida

- **Cores e fontes:** `src/theme.ts` e `src/style.css`.
- **Dificuldade, pontos, power-ups:** `src/config.ts` (objeto `TUNING`).
- **Personagens:** `src/config.ts` (lista `CHARACTERS`).
- **Logo:** a logo oficial em SVG está em `public/logo/` (veja `LEIA-ME.txt`) e aparece na tela de início e no favicon.
- **Recorte SUAS Fácil:** para um evento de assistência social, ajuste textos e personagens; a mecânica de "conectar municípios" já conversa com o discurso do SUAS Fácil.

## Observações

- No modo 2 jogadores, a pontuação enviada ao ranking é a maior das duas (o nome informado é de quem está no dispositivo). Ajuste em `src/main.ts` se quiser gravar as duas.
- Linguagem e tom seguem o padrão institucional da Alicerce: sóbrio, sem travessões, sem gamificar beneficiários nem trivializar recurso público.
- Acessibilidade: alto contraste, botões grandes, `prefers-reduced-motion` respeitado, opção de som.

## Checklist antes do evento

- [x] Logos oficiais em `public/logo/` e símbolo trocado na tela de início.
- [ ] Supabase configurado e migração aplicada; `VITE_EVENTO` com o nome do evento.
- [ ] Testado em um Android e um iPhone reais (carregamento e controles por toque).
- [ ] Modo 3D: aberto com `?3d&debug` num Android intermediário e num iPhone, anotando fps e nível de qualidade (1 e 2 jogadores).
- [ ] Decidido se o QR code abre a versão 2D (padrão) ou a 3D (`?3d`).
- [ ] Nos aparelhos do estande: jogo aberto uma vez com Wi-Fi, para ficar guardado no cache offline.
- [ ] QR code gerado apontando para a URL da Vercel.
- [ ] Tela/telão do estande com o ranking aberto (a tela de fim mostra o ranking do evento).

## Créditos

- Personagens 3D (modo 3D): [Quaternius](https://quaternius.com), pacotes Ultimate Modular Men e Ultimate Modular Women, licença CC0 1.0. Arquivos obtidos pelo [Poly Pizza](https://poly.pizza/u/Quaternius).
- Motor 3D: [Three.js](https://threejs.org) (MIT). Motor 2D: [Phaser](https://phaser.io) (MIT).
