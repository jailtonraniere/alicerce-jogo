import { bus } from "../config";
import type { GameSim } from "../sim/GameSim";
import type { RunnerSim } from "../sim/RunnerSim";

// Controles do motor 3D, com o mesmo mapeamento do 2D:
// 1 jogador: setas ou A D W S. 2 jogadores: J1 em A D W S, J2 nas setas.
// Toque: deslizar (no modo 2 jogadores, cada um na sua metade) e botoes da tela.

const SWIPE_MIN_PX = 18;

function act(r: RunnerSim | undefined, action: string, active: () => boolean) {
  if (!r || !active()) return;
  if (action === "left") r.move(-1);
  else if (action === "right") r.move(1);
  else if (action === "jump") r.doJump();
  else if (action === "duck") r.doDuck();
}

const P1_KEYS: Record<string, string> = { a: "left", d: "right", w: "jump", s: "duck" };
const ARROWS: Record<string, string> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "jump",
  ArrowDown: "duck",
};

// active(): se falso (pausa, contagem de retomada), os comandos sao ignorados.
export function attachInput(root: HTMLElement, sim: GameSim, active: () => boolean = () => true): () => void {
  const duo = sim.cfg.mode === "duo";
  const [p1, p2] = sim.runners;

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const letter = P1_KEYS[e.key.toLowerCase()];
    const arrow = ARROWS[e.key];
    if (letter) act(p1, letter, active);
    else if (arrow) {
      act(duo ? p2 : p1, arrow, active);
      e.preventDefault();
    }
  };

  const starts = new Map<number, { x: number; y: number }>();
  const onDown = (e: PointerEvent) => starts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const onCancel = (e: PointerEvent) => starts.delete(e.pointerId);
  const onUp = (e: PointerEvent) => {
    const start = starts.get(e.pointerId);
    starts.delete(e.pointerId);
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX && Math.abs(dy) < SWIPE_MIN_PX) return;
    const rect = root.getBoundingClientRect();
    const r = duo && start.x - rect.left > rect.width / 2 ? p2 : p1;
    if (Math.abs(dx) > Math.abs(dy)) act(r, dx > 0 ? "right" : "left", active);
    else act(r, dy < 0 ? "jump" : "duck", active);
  };

  // botoes DOM (modo 1 jogador), emitidos pela camada de UI
  const onControl = (payload: { player: number; action: string }) => {
    act(sim.runners[payload.player] ?? p1, payload.action, active);
  };

  window.addEventListener("keydown", onKey);
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onCancel);
  bus.on("control", onControl);

  return () => {
    window.removeEventListener("keydown", onKey);
    root.removeEventListener("pointerdown", onDown);
    root.removeEventListener("pointerup", onUp);
    root.removeEventListener("pointercancel", onCancel);
    bus.off("control", onControl);
  };
}
