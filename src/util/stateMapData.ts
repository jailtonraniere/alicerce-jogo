// Rede de nos que representa o mapa do estado (coordenadas de 0 a 1).
// Compartilhada pelo mapa 2D (stateMap.ts) e pelo holograma do motor 3D.

export type MapNode = { x: number; y: number };

export const MAP_NODES: MapNode[] = [
  { x: 0.18, y: 0.3 },
  { x: 0.34, y: 0.16 },
  { x: 0.5, y: 0.34 },
  { x: 0.3, y: 0.52 },
  { x: 0.66, y: 0.22 },
  { x: 0.8, y: 0.44 },
  { x: 0.58, y: 0.62 },
  { x: 0.46, y: 0.8 },
  { x: 0.74, y: 0.74 },
  { x: 0.22, y: 0.72 },
  { x: 0.88, y: 0.6 },
  { x: 0.12, y: 0.5 },
];

export const MAP_LINKS: [number, number][] = [
  [0, 1], [1, 2], [2, 4], [4, 5], [2, 3], [3, 9],
  [2, 6], [6, 8], [6, 7], [7, 9], [5, 10], [0, 11], [11, 3], [8, 10],
];

// Municipios necessarios para acender o mapa inteiro (mesmo valor do 2D).
export const MAP_FULL_AT = 24;
