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
  duracaoMs: number; // tempo de corrida (sem a contagem), usado para validar a pontuacao
};

// Uma linha do ranking do evento. Por enquanto so o nome identifica a pessoa
// (sem contato, sem orgao): nao ha coleta de dados pessoais alem do nome.
export type RankingEntry = {
  nome: string;
  pontos: number;
  municipios: number;
  personagem: string;
  evento: string;
  duracao_ms: number;
  created_at?: string;
};
