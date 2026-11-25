import type { Character } from "./types";

// Barramento de eventos entre o motor do jogo (2D ou 3D) e a camada DOM (telas de inicio e fim).
// Emissor proprio, sem depender do Phaser, para o motor 3D nao carregar o Phaser.
type Listener = { fn: (...args: any[]) => void; ctx?: unknown };

class EventBus {
  private listeners = new Map<string, Listener[]>();

  on(event: string, fn: (...args: any[]) => void, ctx?: unknown) {
    const list = this.listeners.get(event) ?? [];
    list.push({ fn, ctx });
    this.listeners.set(event, list);
    return this;
  }

  off(event: string, fn: (...args: any[]) => void, ctx?: unknown) {
    const list = this.listeners.get(event);
    if (!list) return this;
    this.listeners.set(
      event,
      list.filter((l) => !(l.fn === fn && (ctx === undefined || l.ctx === ctx)))
    );
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    const list = this.listeners.get(event);
    if (!list?.length) return false;
    for (const l of [...list]) l.fn.apply(l.ctx, args);
    return true;
  }
}

export const bus = new EventBus();

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 854; // proporcao ~9:16, mobile-first

export const EVENTO = import.meta.env.VITE_EVENTO ?? "demonstracao";

// Personagens no estilo "gestao publica".
export const CHARACTERS: Character[] = [
  { id: "gestora", nome: "Gestora", emoji: "\u{1F469}‍\u{1F4BC}" },
  { id: "analista", nome: "Analista de dados", emoji: "\u{1F9D1}‍\u{1F4BB}" },
  { id: "tecnico", nome: "Tecnico", emoji: "\u{1F468}‍\u{1F527}" },
  { id: "secretaria", nome: "Secretaria", emoji: "\u{1F469}‍\u{1F3EB}" },
];

// Parametros de balanceamento do jogo.
export const TUNING = {
  lanes: 3,
  baseSpeed: 300, // px/s que os itens descem
  speedGrowth: 9, // px/s adicionais por segundo de partida
  maxSpeed: 760,
  playerYRatio: 0.82, // posicao vertical do jogador
  hitBand: 34, // tolerancia de colisao em px
  spawnEveryStart: 820, // ms entre spawns no inicio
  spawnEveryMin: 320, // ms minimo entre spawns
  laneChangeMs: 90,
  jumpMs: 520,
  duckMs: 520,
  shieldMs: 5000,
  magnetMs: 6000,
  turboMs: 4000,
  turboFactor: 1.5,
  pointsData: 100,
  pointsIndicator: 160,
  comboStep: 0.1, // +10% por acerto em sequencia
  comboMax: 3,
  pointsPerMunicipio: 400, // a cada X pontos, +1 municipio conectado
};
