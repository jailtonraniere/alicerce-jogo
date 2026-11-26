import { TUNING, GAME_WIDTH } from "../config";
import { RunnerSim } from "./RunnerSim";
import type { GameConfig, GameResult } from "../types";

// Partida completa sem desenho: contagem, velocidade base, 1 ou 2 jogadores e
// resultado (contagem de 4 passos de 700 ms,
// fim 500 ms depois de todos colidirem).

const COUNT_STEP_MS = 700;
const END_DELAY_MS = 500;

export type CountdownLabel = "3" | "2" | "1" | "JÁ" | null;

export class GameSim {
  readonly cfg: GameConfig;
  readonly runners: RunnerSim[];
  running = false;
  finished = false;
  elapsed = 0;
  baseSpeed: number = TUNING.baseSpeed;

  private countdownMs = 0;
  private counting = true;
  private endTimer = -1;

  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    const duo = cfg.mode === "duo";
    const width = duo ? GAME_WIDTH / 2 : GAME_WIDTH;
    this.runners = duo ? [new RunnerSim(width), new RunnerSim(width)] : [new RunnerSim(width)];
  }

  get countdown(): CountdownLabel {
    if (!this.counting) return null;
    const step = Math.floor(this.countdownMs / COUNT_STEP_MS);
    return (["3", "2", "1", "JÁ"] as const)[Math.min(step, 3)];
  }

  // Avanca a partida. Devolve o resultado uma unica vez, quando ela termina.
  update(dtMs: number): GameResult | null {
    if (this.finished) return null;

    if (this.counting) {
      this.countdownMs += dtMs;
      if (this.countdownMs >= COUNT_STEP_MS * 4) {
        this.counting = false;
        this.running = true;
      }
      return null;
    }

    if (this.running) {
      this.elapsed += dtMs;
      this.baseSpeed = Math.min(
        TUNING.maxSpeed,
        TUNING.baseSpeed + (TUNING.speedGrowth * this.elapsed) / 1000
      );
      for (const r of this.runners) r.update(dtMs, this.baseSpeed);
      if (this.runners.every((r) => !r.alive)) {
        this.running = false;
        this.endTimer = END_DELAY_MS;
      }
      return null;
    }

    if (this.endTimer >= 0) {
      this.endTimer -= dtMs;
      if (this.endTimer <= 0) {
        this.finished = true;
        return this.result();
      }
    }
    return null;
  }

  private result(): GameResult {
    const [p1, p2] = this.runners;
    let vencedor: GameResult["vencedor"] = null;
    if (this.cfg.mode === "duo" && p1 && p2) {
      if (p1.pontos > p2.pontos) vencedor = "p1";
      else if (p2.pontos > p1.pontos) vencedor = "p2";
      else vencedor = "empate";
    }
    return {
      mode: this.cfg.mode,
      pontosP1: p1?.pontos ?? 0,
      municipiosP1: p1?.municipios ?? 0,
      pontosP2: p2?.pontos ?? 0,
      municipiosP2: p2?.municipios ?? 0,
      vencedor,
    };
  }
}
