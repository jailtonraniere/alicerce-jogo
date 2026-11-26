// Vibracao curta em momentos-chave (batida, municipio conectado).
// So em aparelhos de toque que suportam (Android); o iPhone ignora.
const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export function vibrate(pattern: number | number[]) {
  if (!touch) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sem vibracao */
  }
}
