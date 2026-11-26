import type { GameMode } from "../types";
import type { GameSim, CountdownLabel } from "../sim/GameSim";
import { TUNING } from "../config";
import { MAP_FULL_AT } from "../util/stateMapData";

// Placar em HTML sobre o canvas 3D: texto nitido em qualquer tela e nas fontes da marca.

const POWERS = [
  {
    key: "shield",
    max: TUNING.shieldMs,
    label: "Escudo",
    svg: '<path d="M12 3l7 2.5-.6 6.6C17.8 16 15.4 19 12 21c-3.4-2-5.8-5-6.4-8.9L5 5.5z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  },
  {
    key: "magnet",
    max: TUNING.magnetMs,
    label: "Ímã",
    svg: '<path d="M7 4v7a5 5 0 0010 0V4"/><path d="M5 4h4M15 4h4"/>',
  },
  {
    key: "turbo",
    max: TUNING.turboMs,
    label: "Turbo",
    svg: '<path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6"/>',
  },
] as const;

type PowerKey = (typeof POWERS)[number]["key"];

type Panel = {
  root: HTMLElement;
  pts: HTMLElement;
  muni: HTMLElement;
  mapFill: HTMLElement;
  chips: Record<PowerKey, { el: HTMLElement; bar: HTMLElement; last: number }>;
  toast: HTMLElement;
  flash: HTMLElement;
  pontos: number;
  municipios: number;
  alive: boolean;
};

export type EngineStats = {
  fps: number;
  cpuMs: number;
  calls: number;
  pixelRatio: number;
  quality: string;
};

// Reinicia uma animacao CSS trocando a classe.
function replay(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly count: HTMLDivElement;
  private readonly debugEl: HTMLDivElement | null;
  private panels: Panel[] = [];
  private lastCount: CountdownLabel = null;
  private lastDebug = "";

  constructor(parent: HTMLElement, debug: boolean) {
    this.root = document.createElement("div");
    this.root.className = "hud3d";
    this.count = document.createElement("div");
    this.count.className = "hud3d-count";
    this.count.setAttribute("aria-live", "assertive");
    this.root.appendChild(this.count);
    this.debugEl = debug ? document.createElement("div") : null;
    if (this.debugEl) {
      this.debugEl.className = "hud3d-debug";
      this.root.appendChild(this.debugEl);
    }
    parent.appendChild(this.root);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? "" : "none";
  }

  setup(mode: GameMode) {
    this.root.querySelectorAll(".hud3d-panel, .hud3d-divider, .hud3d-flash, .hud3d-toast").forEach((el) => el.remove());
    this.panels = [];
    const duo = mode === "duo";
    this.root.classList.toggle("is-duo", duo);
    const players = duo ? 2 : 1;
    for (let i = 0; i < players; i++) {
      const side = duo ? (i === 0 ? " is-left" : " is-right") : "";
      const flash = document.createElement("div");
      flash.className = `hud3d-flash${side}`;
      const panel = document.createElement("div");
      panel.className = `hud3d-panel${side}`;
      panel.innerHTML =
        (duo ? `<div class="hud3d-tag">JOGADOR ${i + 1}</div>` : "") +
        `<div class="hud3d-row"><span>PONTOS</span><b class="hud3d-pts">000000</b></div>` +
        `<div class="hud3d-row"><span>MUNICÍPIOS</span><b class="hud3d-muni">0</b></div>` +
        `<div class="hud3d-map" title="Mapa do estado"><i class="hud3d-map-fill"></i></div>` +
        `<div class="hud3d-chips">` +
        POWERS.map(
          (p) =>
            `<span class="hud3d-chip" data-k="${p.key}" aria-label="${p.label}">` +
            `<svg viewBox="0 0 24 24" aria-hidden="true">${p.svg}</svg><i><b></b></i></span>`
        ).join("") +
        `</div>`;
      const toast = document.createElement("div");
      toast.className = `hud3d-toast${side}`;
      toast.textContent = "MUNICÍPIO CONECTADO";
      this.root.append(flash, panel, toast);
      const chip = (k: PowerKey) => {
        const el = panel.querySelector<HTMLElement>(`.hud3d-chip[data-k="${k}"]`)!;
        return { el, bar: el.querySelector<HTMLElement>("i b")!, last: -1 };
      };
      this.panels.push({
        root: panel,
        pts: panel.querySelector(".hud3d-pts")!,
        muni: panel.querySelector(".hud3d-muni")!,
        mapFill: panel.querySelector(".hud3d-map-fill")!,
        chips: { shield: chip("shield"), magnet: chip("magnet"), turbo: chip("turbo") },
        toast,
        flash,
        pontos: 0,
        municipios: 0,
        alive: true,
      });
    }
    if (duo) {
      const divider = document.createElement("div");
      divider.className = "hud3d-divider";
      this.root.appendChild(divider);
    }
    this.lastCount = null;
    this.count.textContent = "";
    this.count.className = "hud3d-count";
  }

  // countOverride: contagem mostrada no lugar da do jogo (retomada da pausa)
  update(sim: GameSim, stats: EngineStats, countOverride?: CountdownLabel) {
    sim.runners.forEach((r, i) => {
      const p = this.panels[i];
      if (!p) return;
      if (r.pontos !== p.pontos) {
        p.pontos = r.pontos;
        p.pts.textContent = String(r.pontos).padStart(6, "0");
        replay(p.pts, "is-pop");
      }
      if (r.municipios !== p.municipios) {
        const grew = r.municipios > p.municipios;
        p.municipios = r.municipios;
        p.muni.textContent = String(r.municipios);
        p.mapFill.style.transform = `scaleX(${Math.min(1, r.municipios / MAP_FULL_AT)})`;
        if (grew) {
          replay(p.muni, "is-pop");
          replay(p.toast, "is-on");
        }
      }
      // chips dos power-ups com o tempo restante
      for (const pw of POWERS) {
        const c = p.chips[pw.key];
        const left = Math.max(0, r[pw.key]) / pw.max;
        const q = Math.round(left * 50) / 50; // atualiza em passos de 2%
        if (q === c.last) continue;
        if ((c.last > 0) !== (q > 0)) c.el.classList.toggle("is-on", q > 0);
        c.last = q;
        c.bar.style.transform = `scaleX(${q})`;
      }
      if (p.alive && !r.alive) replay(p.flash, "is-on");
      p.alive = r.alive;
    });

    const c = countOverride !== undefined ? countOverride : sim.countdown;
    if (c !== this.lastCount) {
      this.lastCount = c;
      this.count.textContent = c ?? "";
      this.count.classList.remove("is-on");
      if (c) replay(this.count, "is-on");
    }

    if (this.debugEl) {
      const txt = `${stats.fps} fps · ${stats.cpuMs} ms CPU · ${stats.calls} draw calls · px ${stats.pixelRatio} · ${stats.quality}`;
      if (txt !== this.lastDebug) {
        this.lastDebug = txt;
        this.debugEl.textContent = txt;
      }
    }
  }
}
