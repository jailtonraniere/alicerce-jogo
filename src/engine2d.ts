import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { GAME_WIDTH, GAME_HEIGHT } from "./config";
import { COLORS } from "./theme";
import type { GameEngine } from "./engine";

// Motor 2D original (Phaser). Mesma configuracao que ficava no main.ts.
export function createEngine(root: HTMLElement): GameEngine {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: root,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: COLORS.bg2,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [],
  });
  game.scene.add("Game", GameScene);

  return {
    start(cfg) {
      game.scene.start("Game", cfg);
    },
  };
}
