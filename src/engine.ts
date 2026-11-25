import type { Character, GameConfig, GameMode } from "./types";

// Estado da tela de inicio que o motor pode desenhar por tras dela (so o 3D usa).
export type MenuState = {
  mode: GameMode;
  characters: Character[]; // [jogador 1, jogador 2]
};

// Contrato comum dos motores de jogo. O main.ts so conhece esta interface;
// o motor escolhido e carregado sob demanda (2D com Phaser ou 3D com Three.js).
// O fim de partida e avisado pelo barramento: bus.emit("gameover", GameResult).
export interface GameEngine {
  start(cfg: GameConfig): void;
  // Opcional: cena animada por tras da tela de inicio (logo 3D e personagens).
  showMenu?(state: MenuState): void;
}
