import "@fontsource/saira/400.css";
import "@fontsource/saira/600.css";
import "@fontsource/saira/700.css";
import "@fontsource/saira/800.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./style.css";

import { bus, CHARACTERS, EVENTO } from "./config";
import { getTopRanking, saveScores, rankOf, flushPending, online, type SaveResult } from "./supabase";
import { unlockAudio } from "./audioUnlock";
import { MAP_FULL_AT } from "./util/stateMapData";
import type { GameEngine } from "./engine";
import type { GameConfig, GameMode, GameResult, RankingEntry } from "./types";

const qs = <T extends Element>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

// ---- Estado da tela de inicio ----
let mode: GameMode = "single";
let sound = true;
const charIndex = [0, 1]; // P1, P2

const startScreen = qs<HTMLElement>("#start-screen");
const gameoverScreen = qs<HTMLElement>("#gameover-screen");
const touchControls = qs<HTMLElement>("#touch-controls");
const pauseBtn = qs<HTMLButtonElement>("#pause-btn");
const toastEl = qs<HTMLElement>("#toast");

// ---- Motor do jogo (3D, Three.js) ----
// Baixado sob demanda, depois que a tela de inicio ja apareceu. Sem WebGL, o
// aparelho nao roda o jogo: mostra um aviso claro em vez de uma tela vazia.
const gameRoot = qs<HTMLElement>("#game-root");
const enginePromise: Promise<GameEngine> = import("./engine3d")
  .then((m) => m.createEngine(gameRoot))
  .catch((err) => {
    console.warn("Motor 3D indisponivel neste aparelho.", err);
    gameRoot.replaceChildren();
    qs<HTMLElement>("#no-webgl").classList.remove("is-hidden");
    startScreen.classList.add("is-hidden");
    throw err;
  });
enginePromise.catch(() => {
  /* aviso ja exibido */
});

let lastResult: GameResult | null = null;
let lastConfig: GameConfig | null = null;
let menuVisible = true;

// Avisa o motor (3D) do que esta selecionado na tela de inicio.
function syncMenu() {
  if (!menuVisible) return;
  const state = { mode, characters: [characterAt(charIndex[0]), characterAt(charIndex[1])] };
  void enginePromise.then((engine) => {
    if (menuVisible) engine.showMenu?.(state);
  });
}

// ---- Tela de inicio: montagem ----
function characterAt(i: number) {
  return CHARACTERS[((i % CHARACTERS.length) + CHARACTERS.length) % CHARACTERS.length];
}

function renderChars() {
  document.querySelectorAll<HTMLElement>(".char-pick").forEach((pick) => {
    const p = Number(pick.dataset.player);
    const ch = characterAt(charIndex[p]);
    qs<HTMLElement>(".char-emoji", pick).textContent = ch.emoji;
    qs<HTMLElement>(".char-name", pick).textContent = ch.nome;
  });
  syncMenu();
}

function setMode(m: GameMode) {
  mode = m;
  document.body.classList.toggle("mode-duo", m === "duo");
  document.querySelectorAll<HTMLElement>(".mode-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.mode === m)
  );
  qs<HTMLElement>('.char-pick[data-player="1"]').classList.toggle("is-hidden", m !== "duo");
  qs<HTMLElement>("#controls-hint").textContent =
    m === "duo"
      ? "J1: teclas A D (pista), W pula, S abaixa. J2: setas. No celular, cada jogador usa a sua metade da tela."
      : "Deslize ou use as setas. Colete dados, desvie dos obstáculos em laranja.";
  syncMenu();
}

document.querySelectorAll<HTMLElement>(".mode-btn").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode as GameMode))
);

document.querySelectorAll<HTMLElement>(".char-pick").forEach((pick) => {
  const p = Number(pick.dataset.player);
  pick.querySelectorAll<HTMLElement>(".char-arrow").forEach((arrow) =>
    arrow.addEventListener("click", () => {
      charIndex[p] += Number(arrow.dataset.dir);
      renderChars();
    })
  );
});

qs<HTMLButtonElement>("#sound-toggle").addEventListener("click", (e) => {
  sound = !sound;
  const btn = e.currentTarget as HTMLButtonElement;
  btn.setAttribute("aria-pressed", String(sound));
  btn.textContent = sound ? "♫ Som: ligado" : "♪ Som: desligado";
});

// ---- Celular ----
const standalone =
  window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const touchDevice = window.matchMedia("(pointer: coarse)").matches;

// Celular: 2 jogadores fica so para tablet e computador (no celular fica apertado e pesado).
const phoneQuery = window.matchMedia("(pointer: coarse) and (max-width: 600px)");
function applyPhoneLayout() {
  document.body.classList.toggle("is-phone", phoneQuery.matches);
  if (phoneQuery.matches && mode === "duo") setMode("single");
}
phoneQuery.addEventListener?.("change", applyPhoneLayout);

// Instalar como app: Android mostra o pedido do sistema; iPhone so permite pelo menu Compartilhar.
const installBtn = qs<HTMLButtonElement>("#install-btn");
type InstallPrompt = Event & { prompt: () => Promise<void> };
let installPrompt: InstallPrompt | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as InstallPrompt;
  installBtn.classList.remove("is-hidden");
});
window.addEventListener("appinstalled", () => installBtn.classList.add("is-hidden"));
if (isIOS && !standalone) installBtn.classList.remove("is-hidden");
installBtn.addEventListener("click", async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
    installBtn.classList.add("is-hidden");
  } else {
    showToast('No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".', 6000);
  }
});

// Tela cheia ao jogar (Android; o iPhone nao permite em pagina comum) e tela sempre acesa.
function enterFullscreen() {
  if (!touchDevice || standalone || document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement
    .requestFullscreen({ navigationUI: "hide" })
    .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.("portrait"))
    .catch(() => {
      /* sem tela cheia: segue normal */
    });
}

type WakeLock = { release: () => Promise<void> };
let wakeLock: WakeLock | null = null;
function keepScreenOn(on: boolean) {
  const api = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeLock> } }).wakeLock;
  if (on && !wakeLock && api) {
    api.request("screen").then((l) => (wakeLock = l)).catch(() => undefined);
  } else if (!on && wakeLock) {
    void wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  // o sistema solta a trava ao sair do app; pede de novo ao voltar para a partida
  if (document.visibilityState === "visible" && inGame) {
    wakeLock = null;
    keepScreenOn(true);
  }
});

// ---- Controles de toque (1 jogador) ----
touchControls.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
  const fire = (ev: Event) => {
    ev.preventDefault();
    bus.emit("control", { player: 0, action: btn.dataset.action });
  };
  btn.addEventListener("pointerdown", fire);
});

// ---- Iniciar partida ----
function buildConfig(): GameConfig {
  return {
    mode,
    characterP1: characterAt(charIndex[0]),
    characterP2: characterAt(charIndex[1]),
    sound,
  };
}

function startGame() {
  const cfg = buildConfig();
  lastConfig = cfg;
  menuVisible = false;
  if (cfg.sound) unlockAudio(); // precisa acontecer dentro do clique
  if (!startScreen.classList.contains("is-hidden")) {
    // 3D: a tela de inicio esmaece enquanto a camera entra na pista
    startScreen.classList.add("is-leaving");
    window.setTimeout(() => {
      startScreen.classList.add("is-hidden");
      startScreen.classList.remove("is-leaving");
    }, 380);
  } else {
    startScreen.classList.add("is-hidden");
  }
  gameoverScreen.classList.add("is-hidden");
  touchControls.classList.toggle("is-hidden", cfg.mode === "duo");
  pauseBtn.classList.remove("is-hidden");
  inGame = true;
  enterFullscreen();
  keepScreenOn(true);
  void enginePromise.then((engine) => engine.start(cfg));
}

// ---- Como jogar: na primeira partida do aparelho, e pelo botao "?" ----
const howto = qs<HTMLElement>("#howto");
const LS_TUTORIAL = "alicerce_run_tutorial_v1";

function openHowto(first: boolean) {
  qs<HTMLElement>("#howto-close").classList.toggle("is-hidden", first);
  qs<HTMLElement>("#howto-play").textContent = first ? "Entendi, jogar" : "Jogar";
  const keys = qs<HTMLElement>("#howto-keys");
  keys.classList.toggle("is-duo", mode === "duo"); // no celular, so a dica de 2 jogadores aparece
  keys.textContent =
    mode === "duo"
      ? "Dois jogadores: cada um desliza na sua metade da tela. No computador: A D W S e setas."
      : "No computador: setas ou A D W S. Pausa: Esc.";
  howto.classList.remove("is-hidden");
  howto.scrollTop = 0;
}

qs<HTMLButtonElement>("#play-btn").addEventListener("click", () => {
  try {
    if (localStorage.getItem(LS_TUTORIAL)) return startGame();
  } catch {
    /* sem armazenamento: mostra a instrucao */
  }
  openHowto(true);
});
qs<HTMLButtonElement>("#howto-play").addEventListener("click", () => {
  try {
    localStorage.setItem(LS_TUTORIAL, "1");
  } catch {
    /* sem armazenamento */
  }
  howto.classList.add("is-hidden");
  startGame();
});
qs<HTMLButtonElement>("#howto-close").addEventListener("click", () => howto.classList.add("is-hidden"));
qs<HTMLButtonElement>("#help-btn").addEventListener("click", () => openHowto(false));
qs<HTMLButtonElement>("#replay-btn").addEventListener("click", startGame);

// ---- Fim de jogo ----
const LS_NOME = "alicerce_run_nome";
const LS_RECORDE = "alicerce_run_recorde";
const rankForm = qs<HTMLFormElement>("#rank-form");
const rankSubmit = qs<HTMLButtonElement>("#rank-submit");
const rankStatus = qs<HTMLElement>("#rank-status");
let savedThisMatch = false;

function lsGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponivel */
  }
}

// Titulo conforme o resultado (sem comemorar uma partida de zero ponto).
function resultTitle(r: GameResult, recorde: boolean) {
  if (r.mode === "duo") {
    if (r.vencedor === "p1") return "VITÓRIA DO <span>JOGADOR 1</span>";
    if (r.vencedor === "p2") return "VITÓRIA DO <span>JOGADOR 2</span>";
    return "<span>EMPATE</span>";
  }
  const m = r.municipiosP1;
  if (m >= MAP_FULL_AT) return "MAPA <span>COMPLETO</span>";
  if (recorde) return "NOVO <span>RECORDE</span>";
  if (m >= 6) return "VISÃO <span>CONSOLIDADA</span>";
  if (m >= 1) return "BOA <span>CORRIDA</span>";
  return "FIM DE <span>JOGO</span>";
}

bus.on("gameover", (result: GameResult) => {
  lastResult = result;
  touchControls.classList.add("is-hidden");
  pauseBtn.classList.add("is-hidden");
  savedThisMatch = false;

  const duo = result.mode === "duo";
  const recordeAnterior = Number(lsGet(LS_RECORDE) ?? 0);
  const recorde = !duo && result.pontosP1 > 0 && result.pontosP1 > recordeAnterior;
  if (recorde) lsSet(LS_RECORDE, String(result.pontosP1));

  const pontos = duo ? Math.max(result.pontosP1, result.pontosP2) : result.pontosP1;
  const muni = duo ? Math.max(result.municipiosP1, result.municipiosP2) : result.municipiosP1;
  qs<HTMLElement>("#go-title").innerHTML = resultTitle(result, recorde);
  qs<HTMLElement>("#go-score").textContent = pontos.toLocaleString("pt-BR");
  qs<HTMLElement>("#go-muni").textContent =
    muni === 1 ? "1 município conectado" : `${muni.toLocaleString("pt-BR")} municípios conectados`;

  // formulario: so o nome (no modo 2 jogadores, um nome para cada)
  const [n0, n1] = [qs<HTMLInputElement>('input[name="nome0"]'), qs<HTMLInputElement>('input[name="nome1"]')];
  qs<HTMLElement>('.rank-field[data-player="1"]').classList.toggle("is-hidden", !duo);
  qs<HTMLElement>('.rank-field[data-player="0"] span').textContent = duo ? "Jogador 1" : "Seu nome";
  n0.value = lsGet(LS_NOME) ?? "";
  n1.value = "";
  rankForm.classList.remove("is-done");
  rankSubmit.disabled = false;
  rankSubmit.textContent = "Salvar no ranking";
  rankStatus.textContent = "";

  gameoverScreen.classList.remove("is-hidden");
  void refreshRanking();
});

// ---- Ranking ----
type Me = { nome: string; pontos: number };

async function refreshRanking(me: Me[] = []) {
  const list = qs<HTMLOListElement>("#ranking-list");
  list.innerHTML = '<li class="empty">Carregando...</li>';
  const top = await getTopRanking(8);
  if (!top.length) {
    list.innerHTML = `<li class="empty">${
      online ? "Seja a primeira pessoa no ranking do evento." : "Ainda não há pontuações neste aparelho."
    }</li>`;
    return;
  }
  list.innerHTML = "";
  const marked = new Set<Me>();
  top.forEach((e, i) => {
    const li = document.createElement("li");
    const mine = me.find((m) => !marked.has(m) && m.nome === e.nome && m.pontos === e.pontos);
    if (mine) {
      marked.add(mine);
      li.classList.add("is-me");
    }
    li.innerHTML = `<span class="who">${i + 1}. ${escapeHtml(e.nome)}</span><span class="pts">${e.pontos.toLocaleString("pt-BR")}</span>`;
    list.appendChild(li);
  });
}

function escapeHtml(s: string) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function cleanName(v: FormDataEntryValue | null) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
}

// ---- Salvar no ranking (so nome) ----
rankForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!lastResult || !lastConfig || savedThisMatch) return;
  const r = lastResult;
  const cfg = lastConfig;
  const data = new FormData(rankForm);
  const nome0 = cleanName(data.get("nome0"));
  const nome1 = r.mode === "duo" ? cleanName(data.get("nome1")) : "";
  if (!nome0 && !nome1) {
    rankStatus.textContent = "Digite um nome para entrar no ranking.";
    qs<HTMLInputElement>('input[name="nome0"]').focus();
    return;
  }

  const entries: RankingEntry[] = [];
  const base = { evento: EVENTO, duracao_ms: r.duracaoMs };
  if (nome0) entries.push({ ...base, nome: nome0, pontos: r.pontosP1, municipios: r.municipiosP1, personagem: cfg.characterP1.id });
  if (nome1) entries.push({ ...base, nome: nome1, pontos: r.pontosP2, municipios: r.municipiosP2, personagem: cfg.characterP2.id });

  savedThisMatch = true;
  rankSubmit.disabled = true;
  rankSubmit.textContent = "Salvando...";
  (document.activeElement as HTMLElement | null)?.blur(); // fecha o teclado do celular
  if (nome0) lsSet(LS_NOME, nome0);

  const res = await saveScores(entries);
  const msg: Record<SaveResult, string> = {
    salvo: "Pontuação salva no ranking do evento.",
    local: "Pontuação salva neste aparelho.",
    pendente: "Sem conexão agora. A pontuação fica guardada e sobe quando a internet voltar.",
    recusado: "O ranking não aceitou esta pontuação.",
  };
  rankSubmit.textContent = res === "recusado" ? "Não salvo" : "Salvo";
  rankForm.classList.add("is-done");
  rankStatus.textContent = msg[res];

  if (res === "salvo" || res === "local") {
    const pos = await rankOf(entries[0].pontos);
    if (pos) rankStatus.textContent += ` ${entries.length > 1 ? "Jogador 1" : "Você"} ficou em ${pos}º lugar.`;
    void refreshRanking(entries.map((e) => ({ nome: e.nome, pontos: e.pontos })));
  }
});

// ---- Voltar ao inicio ----
function goHome() {
  keepScreenOn(false);
  gameoverScreen.classList.add("is-hidden");
  touchControls.classList.add("is-hidden");
  pauseBtn.classList.add("is-hidden");
  startScreen.classList.remove("is-hidden", "is-leaving");
  startScreen.scrollTop = 0;
  menuVisible = true;
  syncMenu();
}
qs<HTMLButtonElement>("#home-btn").addEventListener("click", goHome);

// ---- Pausa ----
// Botao no canto, tecla Esc/P e pausa automatica (trocar de app, bloquear a
// tela, celular deitado). Ao continuar, o motor faz uma contagem 3, 2, 1.
const pauseScreen = qs<HTMLElement>("#pause-screen");
let inGame = false;

function showPauseScreen() {
  pauseScreen.classList.remove("is-hidden");
  pauseBtn.classList.add("is-hidden");
  touchControls.classList.add("is-hidden");
}

function pauseGame() {
  if (!inGame || !pauseScreen.classList.contains("is-hidden")) return;
  void enginePromise.then((engine) => engine.pause?.());
  showPauseScreen();
  keepScreenOn(false);
}

function resumeGame() {
  keepScreenOn(true);
  pauseScreen.classList.add("is-hidden");
  pauseBtn.classList.remove("is-hidden");
  touchControls.classList.toggle("is-hidden", lastConfig?.mode === "duo");
  void enginePromise.then((engine) => engine.resume?.());
}

pauseBtn.addEventListener("click", pauseGame);
qs<HTMLButtonElement>("#resume-btn").addEventListener("click", resumeGame);
qs<HTMLButtonElement>("#restart-btn").addEventListener("click", () => {
  pauseScreen.classList.add("is-hidden");
  startGame();
});
qs<HTMLButtonElement>("#pause-home-btn").addEventListener("click", () => {
  pauseScreen.classList.add("is-hidden");
  inGame = false;
  goHome();
});
bus.on("autopause", () => {
  if (inGame) showPauseScreen();
});
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" && e.key.toLowerCase() !== "p") return;
  if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
  if (!pauseScreen.classList.contains("is-hidden")) resumeGame();
  else pauseGame();
});
bus.on("gameover", () => {
  inGame = false;
  keepScreenOn(false);
});

// ---- Compartilhar ----
qs<HTMLButtonElement>("#share-btn").addEventListener("click", async () => {
  const pontos = lastResult ? Math.max(lastResult.pontosP1, lastResult.pontosP2) : 0;
  const text = `Fiz ${pontos.toLocaleString("pt-BR")} pontos no Alicerce Run. Me supere!`;
  const url = location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Alicerce Run", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      showToast("Link copiado para compartilhar.");
    }
  } catch {
    showToast("Compartilhamento cancelado.");
  }
});

// ---- Toast ----
let toastTimer: number | undefined;
function showToast(msg: string, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.remove("is-hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.add("is-hidden"), ms);
}

// ---- Cache offline (so no build de producao) ----
// Guarda o jogo no aparelho: abre rapido nas proximas vezes e aguenta rede instavel.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* sem cache offline: o jogo funciona normalmente */
    });
    // Na primeira visita, o que carregou antes do service worker assumir nao passa
    // por ele: manda a lista para ele guardar (motor, fontes, logo, personagens).
    const sendPrecache = () =>
      navigator.serviceWorker.ready.then((reg) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin));
        reg.active?.postMessage({ type: "precache", urls: [location.href, ...urls] });
      });
    window.setTimeout(sendPrecache, 6000);
  });
}

// ---- Inicializacao ----
setMode("single");
applyPhoneLayout();
renderChars();
// pontuacoes que ficaram guardadas por falta de rede sobem agora ou quando a rede voltar
void flushPending();
window.addEventListener("online", () => void flushPending());
