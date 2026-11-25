// Niveis de qualidade do motor 3D. Na primeira partida o jogo comeca no "medio",
// tenta o "alto" se sobrar folga e desce se o fps ficar baixo. O nivel que
// funcionou fica salvo no aparelho. Para testar um nivel fixo: ?q=alto | ?q=medio | ?q=baixo

export type QualityName = "alto" | "medio" | "baixo";

export type QualitySettings = {
  name: QualityName;
  maxPixelRatio: number;
  bloom: boolean;
  msaa: number; // amostras de antisserrilhado no render target (so com bloom)
  particles: number; // fator sobre a quantidade de particulas
  scenery: number; // fator sobre torres e pontos de luz do cenario
};

export const QUALITY: Record<QualityName, QualitySettings> = {
  alto: { name: "alto", maxPixelRatio: 1.75, bloom: true, msaa: 4, particles: 1, scenery: 1 },
  medio: { name: "medio", maxPixelRatio: 1.25, bloom: true, msaa: 0, particles: 0.6, scenery: 0.7 },
  baixo: { name: "baixo", maxPixelRatio: 1, bloom: false, msaa: 0, particles: 0.35, scenery: 0.5 },
};

const ORDER: QualityName[] = ["alto", "medio", "baixo"];
const STORAGE_KEY = "alicerce_run_quality";

export function lowerQuality(q: QualityName): QualityName | null {
  const i = ORDER.indexOf(q);
  return i < ORDER.length - 1 ? ORDER[i + 1] : null;
}

export function higherQuality(q: QualityName): QualityName | null {
  const i = ORDER.indexOf(q);
  return i > 0 ? ORDER[i - 1] : null;
}

export function initialQuality(): { name: QualityName; forced: boolean; saved: boolean } {
  const param = new URLSearchParams(location.search).get("q");
  if (param && param in QUALITY) return { name: param as QualityName, forced: true, saved: false };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in QUALITY) return { name: saved as QualityName, forced: false, saved: true };
  } catch {
    /* armazenamento indisponivel */
  }
  return { name: "medio", forced: false, saved: false };
}

export function rememberQuality(q: QualityName) {
  try {
    localStorage.setItem(STORAGE_KEY, q);
  } catch {
    /* armazenamento indisponivel */
  }
}
