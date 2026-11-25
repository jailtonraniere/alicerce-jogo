import * as THREE from "three";

// Texturas procedurais desenhadas em canvas: nada para baixar, nitidas e nas cores da marca.

const NAVY = "#0A2440";
const AMBER = "#F2A24A";
const AMBER_DARK = "#B8701F";

// Gerador pseudoaleatorio com semente, para o desenho sair sempre igual.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function toTexture(c: HTMLCanvasElement, anisotropy = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

// Pista: placa de circuito marinho, trilhas finas por faixa, separadores e bordas em ciano.
export function circuitGround(anisotropy: number) {
  const W = 256;
  const H = 512;
  const { c, g } = canvas(W, H);
  g.fillStyle = "#081C33";
  g.fillRect(0, 0, W, H);

  const rand = rng(7);
  const laneW = W / 3;
  for (let lane = 0; lane < 3; lane++) {
    const x0 = lane * laneW;
    // trilhas com desvios em 45 graus e pads
    for (let k = 0; k < 4; k++) {
      let x = x0 + 12 + rand() * (laneW - 24);
      let y = 0;
      g.strokeStyle = `rgba(91,194,240,${0.14 + rand() * 0.12})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      while (y < H) {
        const run = 40 + rand() * 90;
        y = Math.min(H, y + run);
        g.lineTo(x, y);
        if (y < H && rand() < 0.6) {
          const dx = (rand() < 0.5 ? -1 : 1) * (8 + rand() * 14);
          const nx = Math.min(x0 + laneW - 8, Math.max(x0 + 8, x + dx));
          y += Math.abs(nx - x);
          x = nx;
          g.lineTo(x, Math.min(H, y));
        }
      }
      g.stroke();
      // pads ao longo da trilha
      for (let p = 0; p < 3; p++) {
        g.fillStyle = "rgba(91,194,240,0.35)";
        g.beginPath();
        g.arc(x0 + 10 + rand() * (laneW - 20), rand() * H, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    // chip discreto no meio da faixa
    if (rand() < 0.8) {
      const cy = rand() * (H - 60);
      g.strokeStyle = "rgba(91,194,240,0.18)";
      g.lineWidth = 2;
      g.strokeRect(x0 + laneW / 2 - 16, cy, 32, 44);
    }
  }

  // marcacao transversal leve (sensacao de velocidade)
  g.fillStyle = "rgba(91,194,240,0.10)";
  g.fillRect(0, 0, W, 3);
  g.fillRect(0, H / 2, W, 2);

  // separadores de faixa
  g.fillStyle = "rgba(120,210,250,0.7)";
  g.fillRect(laneW - 2, 0, 4, H);
  g.fillRect(laneW * 2 - 2, 0, 4, H);
  // bordas
  g.fillStyle = "#8FD6F7";
  g.fillRect(0, 0, 5, H);
  g.fillRect(W - 5, 0, 5, H);

  const t = toTexture(c, anisotropy);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Chao ao redor da pista: grade fina, quase apagada.
export function apronGrid(anisotropy: number) {
  const { c, g } = canvas(128, 128);
  g.fillStyle = "#06172A";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(91,194,240,0.10)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  g.fillStyle = "rgba(91,194,240,0.22)";
  g.fillRect(0, 0, 4, 4);
  const t = toTexture(c, anisotropy);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// "Planilha solta": folha em ambar com grade de celulas.
export function spreadsheet() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = AMBER;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = AMBER_DARK;
  g.fillRect(0, 0, 128, 18);
  g.fillRect(0, 0, 16, 128);
  g.strokeStyle = "rgba(90,45,0,0.55)";
  g.lineWidth = 1.5;
  for (let x = 16; x <= 128; x += 28) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  for (let y = 18; y <= 128; y += 14) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  g.fillStyle = "rgba(255,240,220,0.55)";
  g.fillRect(44, 46, 28, 14);
  g.fillRect(72, 88, 28, 14);
  return toTexture(c);
}

// Faixas de alerta (ambar e marinho em diagonal).
export function hazard() {
  const { c, g } = canvas(256, 64);
  g.fillStyle = AMBER;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = NAVY;
  for (let x = -64; x < 256 + 64; x += 48) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 14, 64);
    g.lineTo(x + 14 + 64, 0);
    g.lineTo(x + 64, 0);
    g.closePath();
    g.fill();
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

// "Recurso parado": bloco ambar com moldura e simbolo de pausa.
export function blockFace() {
  const { c, g } = canvas(256, 256);
  g.fillStyle = AMBER;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = NAVY;
  g.lineWidth = 14;
  g.strokeRect(18, 18, 220, 220);
  g.fillStyle = NAVY;
  g.fillRect(84, 72, 30, 112);
  g.fillRect(142, 72, 30, 112);
  return toTexture(c);
}

// Icones de linha dos power-ups (brancos; a cor vem do material).
export function powerIcon(kind: "shield" | "magnet" | "turbo") {
  const { c, g } = canvas(128, 128);
  g.strokeStyle = "#FFFFFF";
  g.fillStyle = "#FFFFFF";
  g.lineWidth = 11;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  if (kind === "shield") {
    g.moveTo(64, 18);
    g.lineTo(104, 32);
    g.lineTo(100, 70);
    g.quadraticCurveTo(92, 98, 64, 112);
    g.quadraticCurveTo(36, 98, 28, 70);
    g.lineTo(24, 32);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(46, 64);
    g.lineTo(60, 78);
    g.lineTo(84, 52);
    g.stroke();
  } else if (kind === "magnet") {
    g.lineWidth = 16;
    g.moveTo(34, 22);
    g.lineTo(34, 66);
    g.arc(64, 66, 30, Math.PI, 0, true);
    g.lineTo(94, 22);
    g.stroke();
    g.fillRect(22, 18, 24, 14);
    g.fillRect(82, 18, 24, 14);
  } else {
    for (const y of [70, 42]) {
      g.moveTo(30, y + 24);
      g.lineTo(64, y - 8);
      g.lineTo(98, y + 24);
    }
    g.stroke();
  }
  return toTexture(c);
}

// Ponto de luz macio para particulas.
export function softDot() {
  const { c, g } = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

// Painel do holograma do mapa: grade leve e cantos de moldura.
export function holoPanel() {
  const W = 540;
  const H = 200;
  const { c, g } = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(91,194,240,0.10)");
  grad.addColorStop(1, "rgba(91,194,240,0.02)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(91,194,240,0.10)";
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 30) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += 25) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  g.strokeStyle = "rgba(160,225,255,0.9)";
  g.lineWidth = 4;
  const k = 26;
  for (const [x, y, sx, sy] of [
    [2, 2, 1, 1],
    [W - 2, 2, -1, 1],
    [2, H - 2, 1, -1],
    [W - 2, H - 2, -1, -1],
  ]) {
    g.beginPath();
    g.moveTo(x, y + sy * k);
    g.lineTo(x, y);
    g.lineTo(x + sx * k, y);
    g.stroke();
  }
  return toTexture(c);
}

// Fachada das torres: pequenas luzes de servidor.
export function towerLights() {
  const { c, g } = canvas(64, 128);
  g.fillStyle = "#000000";
  g.fillRect(0, 0, 64, 128);
  const rand = rng(11);
  for (let y = 6; y < 128; y += 10) {
    for (let x = 6; x < 64; x += 12) {
      if (rand() < 0.35) {
        g.fillStyle = rand() < 0.85 ? "rgba(91,194,240,0.9)" : "rgba(242,162,74,0.9)";
        g.fillRect(x, y, 6, 2);
      }
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
