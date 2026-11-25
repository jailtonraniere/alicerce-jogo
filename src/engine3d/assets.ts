import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HEX } from "../theme";
import * as tex from "./textures";

// Escala do mundo 3D e recursos compartilhados (geometrias, materiais, texturas).

export const WORLD = {
  laneSpacing: 2.2, // distancia entre o centro das pistas (unidades 3D)
  pxToZ: 0.048, // 1 px da logica = 0.048 unidade de profundidade (pista visivel ~36 unidades)
  trackLength: 260,
  groundTile: 8, // comprimento de um ladrilho da textura da pista
  apronTile: 6,
  playerHeight: 1.6,
  jumpHeight: 1.45,
  duckScale: 0.55,
  postSpacing: 8,
  postCount: 22,
  archSpacing: 34,
  archCount: 6,
  towerSpacing: 7,
  towerCount: 34,
  pulseCount: 14,
};

// Material "aceso": cor acima de 1 entra no bloom. intensity ~1 = sem brilho, >1.8 = brilha.
export function glow(hex: number, intensity: number, extra: THREE.MeshBasicMaterialParameters = {}) {
  const m = new THREE.MeshBasicMaterial({ color: hex, ...extra });
  m.color.multiplyScalar(intensity);
  return m;
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

const SHIELD_VERTEX = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHIELD_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
    float wave = 0.5 + 0.5 * sin(time * 3.0 + vN.y * 9.0);
    float a = f * (0.75 + 0.25 * wave) + 0.05;
    gl_FragColor = vec4(color * a * 2.4, a);
  }
`;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 band;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    vec3 col = mix(horizon, top, smoothstep(0.0, 0.45, h));
    col += band * exp(-abs(h - 0.02) * 22.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const SKY_HORIZON = 0x0b2746;

export class Assets {
  readonly textures = {
    spreadsheet: tex.spreadsheet(),
    hazard: tex.hazard(),
    blockFace: tex.blockFace(),
    dot: tex.softDot(),
    holoPanel: tex.holoPanel(),
    towerLights: tex.towerLights(),
    shield: tex.powerIcon("shield"),
    magnet: tex.powerIcon("magnet"),
    turbo: tex.powerIcon("turbo"),
  };

  readonly geo = {
    dataShell: new THREE.BoxGeometry(0.88, 0.88, 0.88),
    dataEdges: new THREE.EdgesGeometry(new THREE.BoxGeometry(0.88, 0.88, 0.88)),
    dataCore: new THREE.OctahedronGeometry(0.31),
    indicator: mergeGeometries([
      box(0.95, 0.08, 0.5, 0, -0.42, 0),
      box(0.2, 0.34, 0.2, -0.3, -0.21, 0),
      box(0.2, 0.58, 0.2, 0, -0.09, 0),
      box(0.2, 0.84, 0.2, 0.3, 0.04, 0),
    ])!,
    sheets: mergeGeometries([
      box(1.9, 0.11, 0.9, 0, 0.06, 0, 0.0),
      box(1.85, 0.11, 0.9, 0.06, 0.2, 0.03, 0.07),
      box(1.88, 0.11, 0.9, -0.05, 0.34, -0.02, -0.05),
      box(1.8, 0.11, 0.86, 0.04, 0.48, 0.02, 0.1),
    ])!,
    barrierBar: new THREE.BoxGeometry(2.0, 0.5, 0.32),
    barrierEdges: new THREE.EdgesGeometry(new THREE.BoxGeometry(2.0, 0.5, 0.32)),
    barrierPosts: mergeGeometries([box(0.14, 1.55, 0.14, -1.0, 0.775, 0), box(0.14, 1.55, 0.14, 1.0, 0.775, 0)])!,
    block: new THREE.BoxGeometry(1.9, 1.9, 1.2),
    blockEdges: new THREE.EdgesGeometry(new THREE.BoxGeometry(1.9, 1.9, 1.2)),
    hexRing: new THREE.TorusGeometry(0.58, 0.07, 8, 6),
    player: new THREE.CapsuleGeometry(0.42, WORLD.playerHeight - 0.84, 6, 14),
    ring: new THREE.TorusGeometry(0.47, 0.05, 8, 32),
    shield: new THREE.SphereGeometry(1.15, 32, 16),
    shieldWire: new THREE.IcosahedronGeometry(1.17, 1),
    magnetRing: new THREE.TorusGeometry(0.85, 0.035, 6, 48),
    blob: new THREE.CircleGeometry(0.62, 24),
    post: new THREE.BoxGeometry(0.12, 1.3, 0.12),
    rail: new THREE.BoxGeometry(0.1, 0.1, WORLD.trackLength),
    arch: new THREE.TorusGeometry(4.7, 0.07, 6, 3, Math.PI),
    tower: new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0),
    towerCap: new THREE.RingGeometry(0.86, 1.0, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6),
    pulse: new THREE.BoxGeometry(0.07, 0.03, 1.4),
    speedLine: new THREE.BoxGeometry(0.025, 0.025, 3.2),
    mapNode: new THREE.CircleGeometry(0.03, 14),
    mapRing: new THREE.RingGeometry(0.035, 0.045, 24),
  };

  readonly mat = {
    // dado: vidro aditivo (brilho suave) + arestas acesas + nucleo
    dataShell: glow(HEX.accent, 0.45, {
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    dataEdges: new THREE.LineBasicMaterial({ color: new THREE.Color(0xcbefff).multiplyScalar(1.9) }),
    dataCore: glow(HEX.accent, 2.1),
    indicator: new THREE.MeshStandardMaterial({
      color: HEX.accent,
      emissive: HEX.accent,
      emissiveIntensity: 1.4,
      roughness: 0.3,
    }),
    sheets: new THREE.MeshStandardMaterial({
      map: this.textures.spreadsheet,
      roughness: 0.85,
      emissive: 0x3a1a00,
      emissiveIntensity: 0.5,
    }),
    barrier: new THREE.MeshStandardMaterial({
      map: this.textures.hazard,
      roughness: 0.6,
      emissive: 0x3a1a00,
      emissiveIntensity: 0.6,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9a6428, roughness: 0.45, metalness: 0.5 }),
    glitch: glow(HEX.amber, 1.6, {
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    block: new THREE.MeshStandardMaterial({
      map: this.textures.blockFace,
      roughness: 0.6,
      emissive: 0x3a1a00,
      emissiveIntensity: 0.5,
    }),
    blockEdges: new THREE.LineBasicMaterial({ color: new THREE.Color(HEX.amber).multiplyScalar(2.4) }),
    hexRing: glow(HEX.accent, 2.0),
    playerRing: glow(HEX.accent, 2.0),
    baseRing: glow(HEX.accent, 1.1, { transparent: true, opacity: 0.55, depthWrite: false }),
    shield: new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(HEX.accent) }, time: { value: 0 } },
      vertexShader: SHIELD_VERTEX,
      fragmentShader: SHIELD_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    shieldWire: glow(HEX.accent, 1.4, { wireframe: true, transparent: true, opacity: 0.25, depthWrite: false }),
    magnet: glow(HEX.accent, 2.2, { transparent: true, opacity: 0.8, depthWrite: false }),
    blob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
    post: new THREE.MeshStandardMaterial({ color: 0x14304c, roughness: 0.5, metalness: 0.4 }),
    rail: glow(0xcbefff, 0.95), // abaixo do limiar: linha acesa sem halo
    arch: glow(HEX.accent, 1.6),
    tower: new THREE.MeshStandardMaterial({
      color: 0x0c2238,
      roughness: 0.75,
      metalness: 0.25,
      emissive: 0xffffff,
      emissiveMap: this.textures.towerLights,
      emissiveIntensity: 1.6,
    }),
    towerCap: glow(HEX.accent, 2.0, { side: THREE.DoubleSide }),
    pulse: glow(0xcbefff, 2.4, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    speedLine: glow(0xdff6ff, 2.6, {
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    sky: new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x020a14) },
        horizon: { value: new THREE.Color(SKY_HORIZON) },
        band: { value: new THREE.Color(0x1b5a8a).multiplyScalar(0.35) },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  };

  private readonly iconMats = new Map<string, THREE.SpriteMaterial>();
  private readonly emojiMats = new Map<string, THREE.SpriteMaterial>();

  // Icone de power-up como sprite, em ciano aceso.
  icon(kind: "shield" | "magnet" | "turbo") {
    let m = this.iconMats.get(kind);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: this.textures[kind], depthWrite: false });
      m.color.setHex(0xcbefff).multiplyScalar(1.8);
      this.iconMats.set(kind, m);
    }
    return m;
  }

  // Emoji do personagem (provisorio ate os modelos 3D da fase 3).
  emoji(emoji: string) {
    let m = this.emojiMats.get(emoji);
    if (!m) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      g.fillText(emoji, 64, 70);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: t, depthWrite: false });
      m.color.setScalar(0.82); // abaixo do limiar do bloom: o emoji nao estoura
      this.emojiMats.set(emoji, m);
    }
    return m;
  }

  dispose() {
    Object.values(this.geo).forEach((g) => g.dispose());
    Object.values(this.mat).forEach((m) => m.dispose());
    Object.values(this.textures).forEach((t) => t.dispose());
    for (const m of [...this.iconMats.values(), ...this.emojiMats.values()]) {
      if (m.map && !Object.values(this.textures).includes(m.map as THREE.CanvasTexture)) m.map.dispose();
      m.dispose();
    }
    this.iconMats.clear();
    this.emojiMats.clear();
  }
}
