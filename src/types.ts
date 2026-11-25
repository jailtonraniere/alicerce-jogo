export type Character = {
  id: string;
  nome: string;
  emoji: string;
};

export type GameMode = "single" | "duo";

export type GameConfig = {
  mode: GameMode;
  characterP1: Character;
  characterP2: Character;
  sound: boolean;
};

export type GameResult = {
  mode: GameMode;
  // P1 sempre preenchido; P2 so no modo duo.
  pontosP1: number;
  municipiosP1: number;
  pontosP2: number;
  municipiosP2: number;
  vencedor: "p1" | "p2" | "empate" | null;
};

export type RankingEntry = {
  nome: string;
  orgao: string | null;
  cargo: string | null;
  pontos: number;
  municipios: number;
  evento: string;
  created_at?: string;
};

export type LeadEntry = {
  nome: string;
  contato: string;
  orgao: string | null;
  cargo: string | null;
  consentimento_lgpd: boolean;
  evento: string;
  pontos: number;
};
