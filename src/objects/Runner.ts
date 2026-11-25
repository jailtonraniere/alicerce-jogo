import Phaser from "phaser";
import { HEX, COLORS, FONTS } from "../theme";
import { TUNING, GAME_HEIGHT } from "../config";
import type { Character } from "../types";

export type EntityKind =
  | "data"
  | "indicator"
  | "low"
  | "high"
  | "block"
  | "shield"
  | "magnet"
  | "turbo";

type Entity = {
  kind: EntityKind;
  lane: number;
  y: number;
  obj: Phaser.GameObjects.Container;
  alive: boolean;
};

const OBSTACLES: EntityKind[] = ["low", "high", "block"];

export class PlayerRunner {
  scene: Phaser.Scene;
  x0: number;
  width: number;
  lanes = TUNING.lanes;

  lane: number;
  playerY: number;
  player!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Rectangle;
  private label!: Phaser.GameObjects.Text;

  alive = true;
  pontos = 0;
  municipios = 0;
  private combo = 1;

  // timers (ms restantes)
  private jump = 0;
  private duck = 0;
  shield = 0;
  magnet = 0;
  turbo = 0;

  private entities: Entity[] = [];
  private spawnTimer = 0;
  private elapsed = 0;

  constructor(scene: Phaser.Scene, x0: number, width: number, character: Character) {
    this.scene = scene;
    this.x0 = x0;
    this.width = width;
    this.lane = Math.floor(this.lanes / 2);
    this.playerY = GAME_HEIGHT * TUNING.playerYRatio;
    this.buildPlayer(character);
  }

  private laneX(lane: number) {
    return this.x0 + (this.width * (lane + 0.5)) / this.lanes;
  }

  private buildPlayer(character: Character) {
    const c = this.scene.add.container(this.laneX(this.lane), this.playerY);
    c.setDepth(10);
    const shadow = this.scene.add.ellipse(0, 26, 46, 14, 0x000000, 0.3);
    this.body = this.scene.add.rectangle(0, 0, 46, 46, HEX.highlight).setStrokeStyle(2, HEX.highlightBorder);
    this.body.setOrigin(0.5);
    this.label = this.scene.add
      .text(0, 0, character.emoji, { fontFamily: FONTS.body, fontSize: "26px" })
      .setOrigin(0.5);
    c.add([shadow, this.body, this.label]);
    this.player = c;
  }

  // Entrada: -1 esquerda, +1 direita
  move(dir: number) {
    if (!this.alive) return;
    const next = Phaser.Math.Clamp(this.lane + dir, 0, this.lanes - 1);
    if (next === this.lane) return;
    this.lane = next;
    this.scene.tweens.add({
      targets: this.player,
      x: this.laneX(this.lane),
      duration: TUNING.laneChangeMs,
      ease: "Quad.easeOut",
    });
  }

  doJump() {
    if (!this.alive || this.jump > 0 || this.duck > 0) return;
    this.jump = TUNING.jumpMs;
    this.scene.tweens.add({
      targets: this.player,
      y: this.playerY - 46,
      duration: TUNING.jumpMs / 2,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  doDuck() {
    if (!this.alive || this.jump > 0 || this.duck > 0) return;
    this.duck = TUNING.duckMs;
    this.body.setScale(1, 0.55);
    this.player.y = this.playerY + 10;
  }

  private spawn() {
    const r = Math.random();
    let kind: EntityKind;
    if (r < 0.48) kind = Math.random() < 0.6 ? "data" : "indicator";
    else if (r < 0.86) kind = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
    else kind = (["shield", "magnet", "turbo"] as EntityKind[])[Math.floor(Math.random() * 3)];

    const lane = Math.floor(Math.random() * this.lanes);
    const obj = this.buildEntity(kind, lane);
    this.entities.push({ kind, lane, y: -40, obj, alive: true });
  }

  private buildEntity(kind: EntityKind, lane: number): Phaser.GameObjects.Container {
    const c = this.scene.add.container(this.laneX(lane), -40);
    c.setDepth(5);
    const mk = (fill: number, stroke: number, text: string, textColor: string) => {
      const rect = this.scene.add.rectangle(0, 0, 40, 26, fill, 0.18).setStrokeStyle(1.5, stroke);
      const t = this.scene.add
        .text(0, 0, text, { fontFamily: FONTS.display, fontSize: "11px", color: textColor })
        .setOrigin(0.5);
      c.add([rect, t]);
    };
    const circle = (fill: number, text: string) => {
      const circ = this.scene.add.circle(0, 0, 17, fill, 0.2).setStrokeStyle(2, fill);
      const t = this.scene.add
        .text(0, 0, text, { fontFamily: FONTS.body, fontSize: "15px" })
        .setOrigin(0.5);
      c.add([circ, t]);
    };
    switch (kind) {
      case "data":
        mk(HEX.accent, HEX.accent, "dado", COLORS.accent);
        break;
      case "indicator":
        mk(HEX.accent, HEX.accent, "indic.", COLORS.accent);
        break;
      case "low": {
        const bar = this.scene.add.rectangle(0, 10, 46, 16, HEX.amber, 0.85);
        const t = this.scene.add
          .text(0, 10, "⚠", { fontFamily: FONTS.body, fontSize: "12px" })
          .setOrigin(0.5);
        c.add([bar, t]);
        break;
      }
      case "high": {
        const bar = this.scene.add.rectangle(0, -14, 46, 14, HEX.amber, 0.85);
        c.add([bar]);
        break;
      }
      case "block": {
        const block = this.scene.add.rectangle(0, 0, 46, 40, HEX.amber, 0.9).setStrokeStyle(2, 0xffffff);
        c.add([block]);
        break;
      }
      case "shield":
        circle(HEX.accent, "\u{1F6E1}");
        break;
      case "magnet":
        circle(HEX.accent, "\u{1F9F2}");
        break;
      case "turbo":
        circle(HEX.accent, "\u{1F680}");
        break;
    }
    return c;
  }

  private addPoints(base: number) {
    this.pontos += Math.round(base * this.combo);
    this.combo = Math.min(TUNING.comboMax, this.combo + TUNING.comboStep);
    this.municipios = Math.floor(this.pontos / TUNING.pointsPerMunicipio);
  }

  private crash() {
    this.alive = false;
    this.body.setFillStyle(HEX.amber);
    this.scene.tweens.add({
      targets: this.player,
      angle: 12,
      alpha: 0.6,
      duration: 200,
    });
  }

  private collide(e: Entity): "collect" | "crash" | "none" {
    const protectedNow = this.shield > 0;
    switch (e.kind) {
      case "data":
      case "indicator":
        return "collect";
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
    if (this.duck > 0) {
      this.duck -= dtMs;
      if (this.duck <= 0) {
        this.body.setScale(1, 1);
        this.player.y = this.playerY;
      }
    }
    this.shield = Math.max(0, this.shield - dtMs);
    this.magnet = Math.max(0, this.magnet - dtMs);
    this.turbo = Math.max(0, this.turbo - dtMs);

    // visual do escudo
    this.body.setStrokeStyle(2, this.shield > 0 ? HEX.accent : HEX.highlightBorder);

    // spawn progressivo
    const spawnEvery = Phaser.Math.Linear(
      TUNING.spawnEveryStart,
      TUNING.spawnEveryMin,
      Math.min(1, this.elapsed / 45000)
    );
    this.spawnTimer += dtMs;
    if (this.spawnTimer >= spawnEvery) {
      this.spawnTimer = 0;
      this.spawn();
    }

    const speed = baseSpeed * (this.turbo > 0 ? TUNING.turboFactor : 1);

    for (const e of this.entities) {
      if (!e.alive) continue;
      e.y += speed * dt;
      e.obj.y = e.y;

      // ima: puxa dados/indicadores para a pista do jogador
      if (this.magnet > 0 && (e.kind === "data" || e.kind === "indicator") && e.lane !== this.lane) {
        const targetX = this.laneX(this.lane);
        e.obj.x = Phaser.Math.Linear(e.obj.x, targetX, 0.18);
        if (Math.abs(e.obj.x - targetX) < 4) e.lane = this.lane;
      }

      const near = Math.abs(e.y - this.playerY) < TUNING.hitBand;
      const sameLane = e.lane === this.lane || (this.magnet > 0 && Math.abs(e.obj.x - this.laneX(this.lane)) < 24);
      if (near && sameLane) {
        const res = this.collide(e);
        if (res === "collect") {
          this.onCollect(e);
          e.alive = false;
          e.obj.destroy();
        } else if (res === "crash") {
          this.crash();
        }
      }

      if (e.y > GAME_HEIGHT + 40) {
        e.alive = false;
        e.obj.destroy();
        if (OBSTACLES.includes(e.kind)) {
          // desviar reseta o combo so se tocar; passar por obstaculo mantem
        }
      }
    }
    this.entities = this.entities.filter((e) => e.alive);
  }

  private onCollect(e: Entity) {
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

  destroy() {
    this.entities.forEach((e) => e.obj.destroy());
    this.entities = [];
    this.player.destroy();
  }
}
