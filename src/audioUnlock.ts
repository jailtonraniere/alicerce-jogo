// Contexto de audio unico. Navegadores (principalmente no iPhone) so liberam som
// dentro de um toque do usuario, entao o main.ts chama unlockAudio() no clique de JOGAR.

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = audioContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  // buffer silencioso: destrava o audio no Safari do iPhone
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}
