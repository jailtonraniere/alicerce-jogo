import "@fontsource/saira/400.css";
import "@fontsource/saira/600.css";
import "@fontsource/saira/700.css";
import "@fontsource/saira/800.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./style.css";

import { bus, CHARACTERS, EVENTO } from "./config";
import { getTopRanking, submitLead, submitScore, online } from "./supabase";
import { unlockAudio } from "./audioUnlock";
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
  void enginePromise.then((engine) => engine.start(cfg));
}

qs<HTMLButtonElement>("#play-btn").addEventListener("click", startGame);
qs<HTMLButtonElement>("#replay-btn").addEventListener("click", startGame);

// ---- Fim de jogo ----
bus.on("gameover", (result: GameResult) => {
  lastResult = result;
  touchControls.classList.add("is-hidden");

  const primPontos = Math.max(result.pontosP1, result.pontosP2);
  const primMuni = Math.max(result.municipiosP1, result.municipiosP2);

  let title = 'VISÃO <span>CONSOLIDADA!</span>';
  if (result.mode === "duo") {
    if (result.vencedor === "p1") title = "JOGADOR 1 <span>VENCEU!</span>";
    else if (result.vencedor === "p2") title = "JOGADOR 2 <span>VENCEU!</span>";
    else title = "<span>EMPATE!</span>";
  }
  qs<HTMLElement>("#go-title").innerHTML = title;
  qs<HTMLElement>("#go-score").textContent = primPontos.toLocaleString("pt-BR");
  const muniLabel = primMuni === 1 ? "município conectado" : "municípios conectados";
  qs<HTMLElement>("#go-muni").textContent = `🗺 ${primMuni} ${muniLabel}`;

  gameoverScreen.classList.remove("is-hidden");
  void refreshRanking();
});

// ---- Ranking ----
async function refreshRanking() {
  const list = qs<HTMLOListElement>("#ranking-list");
  list.innerHTML = '<li class="empty">Carregando...</li>';
  const top = await getTopRanking(8);
  if (!top.length) {
    list.innerHTML = `<li class="empty">${online ? "Seja o primeiro no ranking." : "Ranking local: jogue e cadastre-se."}</li>`;
    return;
  }
  list.innerHTML = "";
  top.forEach((e, i) => {
    const li = document.createElement("li");
    const org = e.orgao ? `<span class="org"> · ${escapeHtml(e.orgao)}</span>` : "";
    li.innerHTML = `<span class="who">${i + 1}. ${escapeHtml(e.nome)}${org}</span><span class="pts">${e.pontos.toLocaleString("pt-BR")}</span>`;
    list.appendChild(li);
  });
}

function escapeHtml(s: string) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ---- Formulario de lead / ranking ----
qs<HTMLFormElement>("#lead-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!lastResult) return;
  const form = ev.currentTarget as HTMLFormElement;
  const data = new FormData(form);
  const nome = String(data.get("nome") ?? "").trim();
  if (!nome) {
    showToast("Informe um nome para entrar no ranking.");
    return;
  }
  const orgao = String(data.get("orgao") ?? "").trim() || null;
  const cargo = String(data.get("cargo") ?? "").trim() || null;
  const contato = String(data.get("contato") ?? "").trim();
  const consent = data.get("consentimento") === "on";
  const pontos = Math.max(lastResult.pontosP1, lastResult.pontosP2);
  const municipios = Math.max(lastResult.municipiosP1, lastResult.municipiosP2);

  const entry: RankingEntry = { nome, orgao, cargo, pontos, municipios, evento: EVENTO };
  await submitScore(entry);
  if (consent && contato) {
    await submitLead({
      nome,
      contato,
      orgao,
      cargo,
      consentimento_lgpd: true,
      evento: EVENTO,
      pontos,
    });
  }
  form.reset();
  showToast("Pronto, você está no ranking!");
  void refreshRanking();
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
function showToast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.remove("is-hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.add("is-hidden"), 2600);
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
renderChars();
