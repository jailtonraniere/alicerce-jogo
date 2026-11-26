import { TUNING, GAME_HEIGHT } from "../config";

// Logica de um jogador, sem desenho (veio do Runner.ts do antigo jogo 2D):
// mesmas probabilidades de spawn, timers, colisoes, combo e ima, tudo em px
// e px/s como no jogo 2D, lendo o mesmo TUNING. O motor 3D so converte para o
// mundo 3D na hora de desenhar, entao a dificuldade e o tempo de reacao nao mudam.

export type EntityKind =
  | "data"
  | "indicator"
  | "low"
  | "high"
  | "block"
  | "shield"
  | "magnet"
  | "turbo";

export const OBSTACLES: readonly EntityKind[] = ["low", "high", "block"];
export const SPAWN_Y = -40;
export const DESPAWN_Y = GAME_HEIGHT + 40;
export const PLAYER_Y = GAME_HEIGHT * TUNING.playerYRatio;

export type SimEntity = {
  id: number;
  kind: EntityKind;
  lane: number;
  x: number; // px dentro da regiao do jogador (o ima move em x)
  y: number; // px, cresce em direcao ao jogador
  alive: boolean;
};

export type SimEvent =
  | { type: "spawn"; entity: SimEntity }
  | { type: "collect"; entity: SimEntity }
  | { type: "despawn"; entity: SimEntity }
  | { type: "crash" };

let nextId = 1;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class RunnerSim {
  readonly lanes = TUNING.lanes;
  readonly width: number;

  lane: number;
  alive = true;
  pontos = 0;
  municipios = 0;
  private combo = 1;

  // timers (ms restantes)
  jump = 0;
  duck = 0;
  shield = 0;
  magnet = 0;
  turbo = 0;

  entities: SimEntity[] = [];
  // Fila de eventos para o desenho consumir a cada quadro.
  events: SimEvent[] = [];
  // So para testes (?debug&imune): obstaculos nao derrubam.
  invulnerable = false;

  private spawnTimer = 0;
  private elapsed = 0;

  constructor(width: number) {
    this.width = width;
    this.lane = Math.floor(this.lanes / 2);
  }

  laneX(lane: number) {
    return (this.width * (lane + 0.5)) / this.lanes;
  }

  // Entrada: -1 esquerda, +1 direita
  move(dir: number) {
    if (!this.alive) return;
    const next = clamp(this.lane + dir, 0, this.lanes - 1);
    if (next === this.lane) return;
    this.lane = next;
  }

  doJump() {
    if (!this.alive || this.jump > 0 || this.duck > 0) return;
    this.jump = TUNING.jumpMs;
  }

  doDuck() {
    if (!this.alive || this.jump > 0 || this.duck > 0) return;
    this.duck = TUNING.duckMs;
  }

  private spawn() {
    const r = Math.random();
    let kind: EntityKind;
    if (r < 0.48) kind = Math.random() < 0.6 ? "data" : "indicator";
    else if (r < 0.86) kind = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
    else kind = (["shield", "magnet", "turbo"] as EntityKind[])[Math.floor(Math.random() * 3)];

    const lane = Math.floor(Math.random() * this.lanes);
    const entity: SimEntity = { id: nextId++, kind, lane, x: this.laneX(lane), y: SPAWN_Y, alive: true };
    this.entities.push(entity);
    this.events.push({ type: "spawn", entity });
  }

  private addPoints(base: number) {
    this.pontos += Math.round(base * this.combo);
    this.combo = Math.min(TUNING.comboMax, this.combo + TUNING.comboStep);
    this.municipios = Math.floor(this.pontos / TUNING.pointsPerMunicipio);
  }

  private crash() {
    if (this.alive) this.events.push({ type: "crash" });
    this.alive = false;
  }

  private collide(e: SimEntity): "collect" | "crash" | "none" {
    const protectedNow = this.shield > 0 || this.invulnerable;
    switch (e.kind) {
      case "data":
      case "indicator":
      case "shield":
      case "magnet":
      case "turbo":
        return "collect";
      case "low":
        return this.jump > 0 || protectedNow ? "none" : "crash";
      case "high":
        return this.duck > 0 || protectedNow ? "none" : "crash";
      case "block":
        return protectedNow ? "none" : "crash";
    }
  }

  update(dtMs: number, baseSpeed: number) {
    if (!this.alive) return;
    const dt = dtMs / 1000;
    this.elapsed += dtMs;

    // timers
    this.jump = Math.max(0, this.jump - dtMs);
    this.duck = Math.max(0, this.duck - dtMs);
    this.shield = Math.max(0, this.shield - dtMs);
    this.magnet = Math.max(0, this.magnet - dtMs);
    this.turbo = Math.max(0, this.turbo - dtMs);

    // spawn progressivo
    const spawnEvery = lerp(
      TUNING.spawnEveryStart,
      TUNING.spawnEveryMin,
      Math.min(1, this.elapsed / 45000)
    );
    this.spawnTimer += dtMs;
    if (this.spawnTimer >= spawnEvery) {
      this.spawnTimer = 0;
      this.spawn();
    }

    const speed = this.currentSpeed(baseSpeed);

    for (const e of this.entities) {
      if (!e.alive) continue;
      e.y += speed * dt;

      // ima: puxa dados/indicadores para a pista do jogador
      if (this.magnet > 0 && (e.kind === "data" || e.kind === "indicator") && e.lane !== this.lane) {
        const targetX = this.laneX(this.lane);
        e.x = lerp(e.x, targetX, 0.18);
        if (Math.abs(e.x - targetX) < 4) e.lane = this.lane;
      }

      const near = Math.abs(e.y - PLAYER_Y) < TUNING.hitBand;
      const sameLane =
        e.lane === this.lane || (this.magnet > 0 && Math.abs(e.x - this.laneX(this.lane)) < 24);
      if (near && sameLane) {
        const res = this.collide(e);
        if (res === "collect") {
          this.onCollect(e);
          e.alive = false;
          this.events.push({ type: "collect", entity: e });
        } else if (res === "crash") {
          this.crash();
        }
      }

      if (e.alive && e.y > DESPAWN_Y) {
        e.alive = false;
        this.events.push({ type: "despawn", entity: e });
        // combo e "acertos em sequencia": deixar um dado ou indicador passar zera a sequencia
        if (e.kind === "data" || e.kind === "indicator") this.combo = 1;
      }
    }
    this.entities = this.entities.filter((e) => e.alive);
  }

  // Velocidade efetiva (px/s) com turbo, usada tambem pelo desenho do cenario.
  currentSpeed(baseSpeed: number) {
    return baseSpeed * (this.turbo > 0 ? TUNING.turboFactor : 1);
  }

  private onCollect(e: SimEntity) {
    switch (e.kind) {
      case "data":
        this.addPoints(TUNING.pointsData);
        break;
      case "indicator":
        this.addPoints(TUNING.pointsIndicator);
        break;
      case "shield":
        this.shield = TUNING.shieldMs;
        break;
      case "magnet":
        this.magnet = TUNING.magnetMs;
        break;
      case "turbo":
        this.turbo = TUNING.turboMs;
        break;
    }
  }
}
