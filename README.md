# Alicerce Run

Jogo web em 3D (corrida infinita) de ativação de marca da **Alicerce**, hub de tecnologia para gestão pública. Pensado para eventos do setor público e para o celular: o visitante abre por QR code, corre coletando dados e conectando municípios ao mapa do estado, e entra no ranking do evento só com o nome. Roda no navegador, sem instalar (e pode ser instalado como app).

Feito com Vite + TypeScript + Three.js. Ranking no Supabase. Publicado no GitHub Pages. Identidade visual marinho/ciano (Saira + IBM Plex Sans).

- Jogo publicado: https://jailtonraniere.github.io/alicerce-jogo/
- Roteiro de teste no celular: [docs/roteiro-teste-celular.md](docs/roteiro-teste-celular.md)

## Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (porta 5173). Sem as variáveis do Supabase, o ranking fica salvo só no aparelho. Para testar num celular na mesma rede, use o endereço "Network" que o Vite mostra.

Parâmetros de teste na URL:

- `?debug` mostra fps, tempo de CPU por quadro, draw calls, resolução interna e nível de qualidade no canto da tela.
- `?debug&imune` deixa o jogador imune a obstáculos, para avaliar cenário e efeitos.
- `?q=alto`, `?q=medio` ou `?q=baixo` fixa o nível de qualidade.

## Build e preview

```bash
npm run build     # checa tipos e gera dist/
npm run preview   # serve o build local
```

## O que o jogo tem

- **Tela de início:** logo da Alicerce em metal escovado (extrudada da logo vetorizada em `public/logo/`), personagem escolhido em 3D acenando, cenário rodando ao fundo, botão "?" com as instruções e botão "Instalar no celular".
- **Como jogar:** na primeira partida do aparelho aparece um cartão com os gestos (deslizar para os lados, para cima e para baixo), o que coletar e do que desviar.
- **Partida:** pista de circuito com brilho (bloom), holograma do mapa do estado que acende a cada município, itens e obstáculos modelados em código, partículas, efeitos de power-up e câmera de entrada.
- **Pausa:** botão no canto, tecla Esc, e pausa automática ao trocar de app, bloquear a tela ou deitar o celular. Ao continuar, contagem 3, 2, 1.
- **Fim:** título conforme o resultado, recorde pessoal, ranking do evento só com o nome (lembrado no aparelho) e a sua posição em destaque.
- **Personagens 3D:** Gestora, Analista de dados, Técnico e Secretária (modelos da Quaternius, CC0). Os originais ficam em `assets-src/quaternius/` e os arquivos do jogo em `public/models/`. Para regerar (só as animações usadas, uma malha por personagem, cores da marca nos vértices): `node tools/build-characters.mjs`. As cores das roupas ficam nesse script.
- **Áudio:** trilha e efeitos sintetizados em tempo real (Web Audio, `src/engine3d/audio.ts`), sem arquivos de som. O botão "Som" liga e desliga.
- **Celular:** instalável (abre em tela cheia e em pé), tela cheia ao jogar no Android, tela sempre acesa na partida, vibração curta na batida e ao conectar município (Android), aviso para girar o celular deitado. O modo 2 jogadores aparece só em tablet e computador.
- **Qualidade automática:** começa no nível médio, tenta o alto se o aparelho tiver folga e desce se ficar abaixo de 45 fps. O nível que funcionou fica salvo no aparelho.
- **Sem 3D:** em aparelho sem WebGL, aparece um aviso claro.

## Desempenho e cache offline

- **Cache offline:** no build de produção, um service worker (`public/sw.js`) guarda no aparelho tudo o que o jogo usou. Nas próximas visitas o jogo abre rápido e funciona mesmo sem rede. A página sempre busca a versão nova primeiro.
- **Referência medida (PC com GPU integrada, Chrome):** 1 jogador a 60 fps e cerca de 40 draw calls; 2 jogadores a 56 a 60 fps. Com a CPU desacelerada 4 vezes (simulando um celular intermediário), 1 jogador fica entre 52 e 60 fps. Falta medir em celulares reais (veja o roteiro).

## Configurar o Supabase (ranking do evento)

Por enquanto o ranking guarda **só o nome** (sem contato, órgão ou cargo). Sem Supabase, o jogo funciona e o ranking fica salvo só no aparelho.

1. Crie um projeto no Supabase (ou reaproveite um existente).
2. No **SQL Editor**, rode o arquivo `supabase/migrations/20261126000001_ranking_so_nome.sql` inteiro. Ele funciona num projeto novo e também em cima da migração anterior. Cria a tabela `ranking`, as regras de validação, as permissões e a view pública `v_ranking_top`.
3. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**. Nunca use a `service_role` no jogo.
4. No GitHub, em **Settings > Secrets and variables > Actions**: Variables `VITE_SUPABASE_URL` (a URL) e `VITE_EVENTO` (ex.: `congemas-2026`); Secret `VITE_SUPABASE_ANON_KEY` (a anon key). Depois rode o workflow de publicação de novo.
5. Para testar no computador, copie `.env.example` para `.env.local` (fica fora do Git) e preencha os mesmos três valores.

Como a segurança funciona: o visitante só consegue **gravar** nome, pontos, municípios, personagem, evento e duração, e só **ler** as colunas públicas do ranking. O banco recusa pontuação incoerente (municípios que não batem com os pontos, ou pontos acima do máximo possível para o tempo jogado). Se a rede cair na hora de salvar, a pontuação fica guardada no aparelho e sobe quando a conexão voltar.

Moderação: o arquivo da migração traz, no final, os comandos para ver o ranking de um evento, remover uma linha indevida e zerar um evento.

## Publicar no GitHub Pages (configurado)

O workflow `.github/workflows/pages.yml` gera o build e publica a cada envio ao ramo `main`, em `https://jailtonraniere.github.io/alicerce-jogo/`. Para rodar de novo sem commit: **Actions > Publicar no GitHub Pages > Run workflow**. Depois de mudar as variáveis do Supabase, rode o workflow de novo: elas entram no momento do build.

Alternativa: a Vercel também funciona (`vercel.json` já define build, saída e cache). Importe o repositório e cadastre as mesmas três variáveis em Settings > Environment Variables.

## Como jogar

- **Celular:** deslize o dedo. Para os lados troca de pista, para cima pula, para baixo abaixa. Também há botões na tela.
- **Computador:** setas ou A D W S. Esc pausa.
- **2 jogadores (tablet e computador):** tela dividida. Jogador 1 usa A D W S; jogador 2 usa as setas. No tablet, cada um desliza na sua metade. Vence quem fizer mais pontos.
- **Coletar:** dados e indicadores (em ciano) viram pontos e municípios conectados. Coletar em sequência aumenta o combo; deixar um passar zera a sequência.
- **Desviar:** obstáculos em laranja (planilha solta, dado desatualizado, recurso parado). Pule os baixos, abaixe nos altos, troque de pista nos blocos.
- **Power-ups:** escudo, ímã e turbo.

## Estrutura

```
src/
  main.ts            telas em HTML (início, como jogar, pausa, fim, ranking) e recursos de celular
  engine.ts          contrato entre as telas e o motor
  engine3d/          motor 3D (Three.js): cenário, holograma do mapa, personagens, itens,
                     partículas, brilho, áudio, qualidade automática, placar, controles e pausa
  sim/               lógica do jogo sem desenho (pistas, colisões, pontuação, power-ups)
  config.ts          constantes, personagens, balanceamento (TUNING), barramento de eventos
  theme.ts           tokens de cor e fontes da marca
  supabase.ts        ranking (Supabase, com modo local e reenvio sem rede)
  audioUnlock.ts     libera o áudio no toque de JOGAR (necessário no iPhone)
  style.css          estilo das telas
supabase/migrations/ SQL do ranking
public/              favicon, logos (SVG), ícones do app, manifesto, personagens (models/), sw.js
assets-src/          arquivos originais dos personagens 3D
tools/               scripts para preparar e inspecionar os modelos 3D
docs/                roteiro de teste no celular
```

## Personalização rápida

- **Cores e fontes:** `src/theme.ts` e `src/style.css`.
- **Dificuldade, pontos, power-ups:** `src/config.ts` (objeto `TUNING`). Se mudar `pointsPerMunicipio`, ajuste a regra `ranking_municipios_coerentes` na migração.
- **Personagens:** `src/config.ts` (lista `CHARACTERS`) e `tools/build-characters.mjs`.
- **Logo:** `public/logo/` (veja `LEIA-ME.txt`).

## Observações

- Linguagem e tom seguem o padrão institucional da Alicerce: sóbrio, sem travessões, sem gamificar beneficiários nem trivializar recurso público.
- Acessibilidade: alto contraste, botões grandes, `prefers-reduced-motion` respeitado, opção de som.
- O antigo jogo 2D (Phaser) foi removido em novembro de 2026 e continua no histórico do Git.

## Checklist antes do evento

- [x] Logos oficiais em `public/logo/` e símbolo trocado na tela de início.
- [ ] Supabase configurado e migração aplicada; `VITE_EVENTO` com o nome do evento.
- [ ] Roteiro de teste feito num Android intermediário e num iPhone ([docs/roteiro-teste-celular.md](docs/roteiro-teste-celular.md)).
- [ ] Nos aparelhos do estande: jogo aberto uma vez com Wi-Fi, para ficar guardado no cache offline.
- [ ] QR code gerado apontando para o endereço publicado.
- [ ] Tela/telão do estande com o ranking aberto (a tela de fim mostra o ranking do evento).

## Créditos

- Personagens 3D: [Quaternius](https://quaternius.com), pacotes Ultimate Modular Men e Ultimate Modular Women, licença CC0 1.0. Arquivos obtidos pelo [Poly Pizza](https://poly.pizza/u/Quaternius).
- Motor 3D: [Three.js](https://threejs.org) (MIT).
