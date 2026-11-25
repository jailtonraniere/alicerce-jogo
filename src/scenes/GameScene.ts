import Phaser from "phaser";
import { HEX, COLORS, FONTS } from "../theme";
import { TUNING, GAME_WIDTH, GAME_HEIGHT, bus } from "../config";
import { PlayerRunner } from "../objects/Runner";
import { StateMap } from "../util/stateMap";
import type { GameConfig, GameResult } from "../types";

export class GameScene extends Phaser.Scene {
  private cfg!: GameConfig;
  private runners: PlayerRunner[] = [];
  private maps: StateMap[] = [];
  private hud: Phaser.GameObjects.Text[] = [];
  private running = false;
  private elapsed = 0;
  private pointerStart = new Map<number, { x: number; y: number }>();

  constructor() {
    super("Game");
  }

  init(cfg: GameConfig) {
    this.cfg = cfg;
    this.runners = [];
    this.maps = [];
    this.hud = [];
    this.running = false;
    this.elapsed = 0;
    this.pointerStart.clear();
  }

  create() {
    this.drawBackground();

    const duo = this.cfg.mode === "duo";
    if (duo) {
      const half = GAME_WIDTH / 2;
      this.setupRegion(0, half, this.cfg.characterP1, 0);
      this.setupRegion(half, half, this.cfg.characterP2, 1);
      // divisoria
      this.add.rectangle(half, GAME_HEIGHT / 2, 2, GAME_HEIGHT, HEX.surfaceBorder, 0.8).setDepth(2);
    } else {
      this.setupRegion(0, GAME_WIDTH, this.cfg.characterP1, 0);
    }

    this.setupInput();
    this.countdown();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  private drawBackground() {
    const g = this.add.graphics();
    g.setDepth(-10);
    g.fillGradientStyle(HEX.bg0, HEX.bg0, HEX.bg2, HEX.bg2, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // pistas (linhas verticais suaves) por regiao
    const lanesGfx = this.add.graphics();
    lanesGfx.setDepth(-4);
    lanesGfx.lineStyle(1, HEX.accent, 0.12);
    const regions = this.cfg.mode === "duo" ? [[0, GAME_WIDTH / 2], [GAME_WIDTH / 2, GAME_WIDTH / 2]] : [[0, GAME_WIDTH]];
    regions.forEach(([x0, w]) => {
      for (let i = 1; i < TUNING.lanes; i++) {
        const x = x0 + (w * i) / TUNING.lanes;
        lanesGfx.beginPath();
        lanesGfx.moveTo(x, GAME_HEIGHT * 0.32);
        lanesGfx.lineTo(x, GAME_HEIGHT);
        lanesGfx.strokePath();
      }
    });
  }

  private setupRegion(x0: number, width: number, character: GameConfig["characterP1"], idx: number) {
    const map = new StateMap(this, x0 + width * 0.08, 70, width * 0.84, 150);
    this.maps.push(map);

    const runner = new PlayerRunner(this, x0, width, character);
    this.runners.push(runner);

    const hud = this.add
      .text(x0 + 12, 16, "", {
        fontFamily: FONTS.display,
        fontSize: "15px",
        color: COLORS.ink,
      })
      .setDepth(20);
    this.hud.push(hud);

    // rotulo do jogador no modo duo
    if (this.cfg.mode === "duo") {
      this.add
        .text(x0 + width / 2, 44, idx === 0 ? "JOGADOR 1" : "JOGADOR 2", {
          fontFamily: FONTS.display,
          fontSize: "12px",
          color: COLORS.secondary,
        })
        .setOrigin(0.5)
        .setDepth(20);
    }
  }

  private setupInput() {
    this.input.addPointer(2);
    const kb = this.input.keyboard;
    if (kb) {
      kb.on("keydown", (e: KeyboardEvent) => this.onKey(e.key));
    }
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.pointerStart.set(p.id, { x: p.x, y: p.y });
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const start = this.pointerStart.get(p.id);
      this.pointerStart.delete(p.id);
      if (!start) return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      const which = this.cfg.mode === "duo" && start.x > GAME_WIDTH / 2 ? 1 : 0;
      const r = this.runners[which];
      if (!r) return;
      if (Math.abs(dx) > Math.abs(dy)) r.move(dx > 0 ? 1 : -1);
      else if (dy < 0) r.doJump();
      else r.doDuck();
    });

    // botoes DOM (modo 1 jogador), emitidos pela camada de UI
    bus.on("control", this.onControl, this);
  }

  private onControl = (payload: { player: number; action: string }) => {
    const r = this.runners[payload.player] ?? this.runners[0];
    if (!r) return;
    if (payload.action === "left") r.move(-1);
    else if (payload.action === "right") r.move(1);
    else if (payload.action === "jump") r.doJump();
    else if (payload.action === "duck") r.doDuck();
  };

  private onKey(key: string) {
    const p1 = this.runners[0];
    const p2 = this.runners[1];
    if (this.cfg.mode === "duo") {
      if (key === "a" || key === "A") p1?.move(-1);
      else if (key === "d" || key === "D") p1?.move(1);
      else if (key === "w" || key === "W") p1?.doJump();
      else if (key === "s" || key === "S") p1?.doDuck();
      else if (key === "ArrowLeft") p2?.move(-1);
      else if (key === "ArrowRight") p2?.move(1);
      else if (key === "ArrowUp") p2?.doJump();
      else if (key === "ArrowDown") p2?.doDuck();
    } else {
      if (key === "ArrowLeft" || key === "a" || key === "A") p1?.move(-1);
      else if (key === "ArrowRight" || key === "d" || key === "D") p1?.move(1);
      else if (key === "ArrowUp" || key === "w" || key === "W") p1?.doJump();
      else if (key === "ArrowDown" || key === "s" || key === "S") p1?.doDuck();
    }
  }

  private countdown() {
    const label = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "3", {
        fontFamily: FONTS.display,
        fontSize: "72px",
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(40);
    let n = 3;
    this.time.addEvent({
      delay: 700,
      repeat: 3,
      callback: () => {
        n -= 1;
        if (n > 0) label.setText(String(n));
        else if (n === 0) label.setText("JA");
        else {
          label.destroy();
          this.running = true;
        }
      },
    });
  }

  update(_time: number, delta: number) {
    if (!this.running) return;
    this.elapsed += delta;

    const baseSpeed = Math.min(
      TUNING.maxSpeed,
      TUNING.baseSpeed + (TUNING.speedGrowth * this.elapsed) / 1000
    );

    this.runners.forEach((r, i) => {
      r.update(delta, baseSpeed);
      const ratio = Math.min(1, r.municipios / 24);
      this.maps[i]?.draw(ratio);
      const pw: string[] = [];
      if (r.shield > 0) pw.push("\u{1F6E1}");
      if (r.magnet > 0) pw.push("\u{1F9F2}");
      if (r.turbo > 0) pw.push("\u{1F680}");
      this.hud[i]?.setText(
        `PONTOS ${String(r.pontos).padStart(6, "0")}\nMUNICIPIOS ${r.municipios}  ${pw.join(" ")}`
      );
    });

    const allDead = this.runners.every((r) => !r.alive);
    if (allDead) {
      this.running = false;
      this.time.delayedCall(500, () => this.endGame());
    }
  }

  private endGame() {
    const p1 = this.runners[0];
    const p2 = this.runners[1];
    let vencedor: GameResult["vencedor"] = null;
    if (this.cfg.mode === "duo" && p1 && p2) {
      if (p1.pontos > p2.pontos) vencedor = "p1";
      else if (p2.pontos > p1.pontos) vencedor = "p2";
      else vencedor = "empate";
    }
    const result: GameResult = {
      mode: this.cfg.mode,
      pontosP1: p1?.pontos ?? 0,
      municipiosP1: p1?.municipios ?? 0,
      pontosP2: p2?.pontos ?? 0,
      municipiosP2: p2?.municipios ?? 0,
      vencedor,
    };
    bus.emit("gameover", result);
  }

  private cleanup() {
    bus.off("control", this.onControl, this);
    this.runners.forEach((r) => r.destroy());
    this.maps.forEach((m) => m.destroy());
    this.runners = [];
    this.maps = [];
  }
}
