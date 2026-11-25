import * as THREE from "three";
import { CharacterInstance, MODEL_HEIGHT, loadCharacter } from "./characters";
import type { MenuState } from "../engine";

// Cena da tela de inicio, desenhada por cima do cenario (escurecido) e por baixo
// dos textos HTML: logo da Alicerce em metal escovado e os personagens escolhidos,
// cada um posicionado exatamente sobre a sua caixa na tela.

const CAM_Z = 20;
const FOV = 30;
const LOGO_INTRO_MS = 1300;

type Slot = { id: string | null; inst: CharacterInstance | null; token: number };

// Le os contornos (M x yL x y ... Z) do SVG da logo vetorizada.
function parsePolygons(d: string): THREE.Vector2[][] {
  return d
    .split(/Z/i)
    .map((seg) => seg.replace(/^[\sM]+/i, "").trim())
    .filter(Boolean)
    .map((seg) =>
      seg.split(/L/i).map((pair) => {
        const [x, y] = pair.trim().split(/[\s,]+/).map(Number);
        return new THREE.Vector2(x, -y); // SVG tem y para baixo
      })
    );
}

function inside(p: THREE.Vector2, poly: THREE.Vector2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

// Contornos -> formas com furos (o miolo do A e do R).
function toShapes(polys: THREE.Vector2[][]): THREE.Shape[] {
  const holeOf = polys.map((p, i) => polys.findIndex((q, j) => j !== i && inside(p[0], q)));
  const shapes = new Map<number, THREE.Shape>();
  polys.forEach((p, i) => {
    if (holeOf[i] === -1) shapes.set(i, new THREE.Shape(p));
  });
  polys.forEach((p, i) => {
    const parent = holeOf[i];
    if (parent !== -1) shapes.get(parent)?.holes.push(new THREE.Path(p));
  });
  return [...shapes.values()];
}

// Ambiente de estudio para os reflexos do metal: degrade (claro em cima, escuro
// embaixo) e faixas de luz atras da camera, como numa foto de produto.
function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: "varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "varying vec3 d; void main(){ float h = d.y * 0.5 + 0.5;" +
        " vec3 c = mix(vec3(0.03,0.07,0.12), vec3(0.55,0.62,0.7), smoothstep(0.2,0.75,h));" +
        " c = mix(c, vec3(0.95), smoothstep(0.82,1.0,h)); gl_FragColor = vec4(c,1.0); }",
    })
  );
  s.add(dome);
  const strip = (y: number, w: number, h: number, k: number, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.material.color.setHex(color).multiplyScalar(k);
    m.position.set(0, y, 6);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  strip(2.4, 14, 1.4, 4); // faixa principal (brilho largo)
  strip(-0.6, 14, 0.35, 2.5); // filete
  strip(-2.6, 14, 0.8, 1.2, 0x7fd4ff); // reflexo ciano embaixo
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.02).texture;
  pmrem.dispose();
  return tex;
}

// Textura de metal escovado: riscos horizontais finos (usada como rugosidade).
function brushedTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6a6a6a";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 70 + Math.floor(Math.random() * 90);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 30 + Math.random() * 140, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 90, 1 / 90);
  return t;
}

export class Menu {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  visible = false;

  private logo: THREE.Group | null = null;
  private logoWidth = 1;
  private logoT = 0;
  private readonly shine = new THREE.PointLight(0xffffff, 0, 40, 1.5);
  private readonly slots: Slot[] = [
    { id: null, inst: null, token: 0 },
    { id: null, inst: null, token: 0 },
  ];
  private time = 0;
  private w = 1;
  private h = 1;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly root: HTMLElement,
    private readonly reducedMotion: boolean
  ) {
    this.scene.environment = studioEnvironment(renderer);

    this.scene.add(new THREE.HemisphereLight(0xcfeaff, 0x0a2440, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(3, 5, 8);
    const rim = new THREE.DirectionalLight(0x7fd4ff, 2.4);
    rim.position.set(-4, 5, -6);
    this.shine.position.set(-12, 2, 6);
    this.scene.add(key, rim, this.shine);

    this.camera.position.set(0, 0, CAM_Z);
    this.camera.lookAt(0, 0, 0);
    void this.buildLogo();
  }

  private async buildLogo() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}logo/alicerce-branca.svg`);
      const svg = await res.text();
      const d = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("path")?.getAttribute("d");
      if (!d) return;
      const geo = new THREE.ExtrudeGeometry(toShapes(parsePolygons(d)), {
        depth: 9,
        bevelEnabled: true,
        bevelThickness: 1.6,
        bevelSize: 1.0,
        bevelSegments: 2,
        curveSegments: 1,
      });
      geo.center();
      geo.computeBoundingBox();
      this.logoWidth = geo.boundingBox!.max.x - geo.boundingBox!.min.x;
      const metal = new THREE.MeshStandardMaterial({
        color: 0xf4f7fa,
        metalness: 1,
        roughness: 0.62,
        roughnessMap: brushedTexture(),
        envMapIntensity: 1.25,
      });
      const mesh = new THREE.Mesh(geo, metal);
      this.logo = new THREE.Group();
      this.logo.add(mesh);
      this.logo.visible = this.visible;
      this.scene.add(this.logo);
      this.logoT = 0;
      document.body.classList.add("logo3d-ready");
    } catch (err) {
      console.warn("Logo 3D indisponivel, mantendo a logo da pagina.", err);
    }
  }

  show(state: MenuState) {
    const wasVisible = this.visible;
    this.visible = true;
    if (!wasVisible) this.logoT = 0;
    if (this.logo) this.logo.visible = true;
    const count = state.mode === "duo" ? 2 : 1;
    this.slots.forEach((slot, i) => {
      const want = i < count ? state.characters[i]?.id ?? null : null;
      if (want === slot.id) return;
      slot.id = want;
      slot.inst?.dispose();
      slot.inst = null;
      const token = ++slot.token;
      if (!want) return;
      void loadCharacter(want).then((asset) => {
        if (!asset || token !== slot.token || !this.visible) return;
        const inst = new CharacterInstance(asset);
        inst.root.rotation.y = Math.PI; // de frente para a tela
        slot.inst = inst;
        this.scene.add(inst.root);
        inst.greet();
        document.body.classList.add("chars3d-ready");
      });
    });
  }

  hide() {
    this.visible = false;
    if (this.logo) this.logo.visible = false;
    this.slots.forEach((s) => {
      s.inst?.dispose();
      s.inst = null;
      s.id = null;
      s.token++;
    });
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Converte a caixa de um elemento da pagina em posicao e escala no mundo do menu.
  private anchor(el: Element | null, rootRect: DOMRect) {
    if (!el || !(el as HTMLElement).offsetParent) return null;
    const r = el.getBoundingClientRect();
    const halfH = CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const upp = (2 * halfH) / this.h; // unidades do mundo por pixel
    return {
      x: (r.left + r.width / 2 - rootRect.left - this.w / 2) * upp,
      y: (this.h / 2 - (r.top + r.height / 2 - rootRect.top)) * upp,
      bottom: (this.h / 2 - (r.bottom - rootRect.top)) * upp,
      width: r.width * upp,
      height: r.height * upp,
    };
  }

  update(dtMs: number) {
    if (!this.visible) return;
    this.time += dtMs;
    const rootRect = this.root.getBoundingClientRect();
    const sway = this.reducedMotion ? 0 : 1;

    if (this.logo) {
      const a = this.anchor(document.querySelector("#start-screen .brand"), rootRect);
      this.logo.visible = !!a;
      if (a) {
        this.logoT = Math.min(LOGO_INTRO_MS, this.logoT + dtMs);
        const k = this.reducedMotion ? 1 : 1 - Math.pow(1 - this.logoT / LOGO_INTRO_MS, 3);
        const scale = ((a.width * 0.96) / this.logoWidth) * (0.85 + 0.15 * k);
        this.logo.scale.setScalar(scale);
        this.logo.position.set(a.x, a.y, 0);
        this.logo.rotation.y = -0.9 * (1 - k) + sway * Math.sin(this.time * 0.0007) * 0.1;
        this.logo.rotation.x = sway * Math.sin(this.time * 0.0005) * 0.05;
      }
      // brilho que atravessa o metal a cada poucos segundos
      const cycle = (this.time % 4200) / 4200;
      this.shine.position.x = -14 + cycle * 28;
      this.shine.position.y = (a?.y ?? 0) + 1.5;
      this.shine.intensity = this.reducedMotion ? 0 : 120 * Math.sin(Math.PI * Math.min(1, cycle * 1.6));
    }

    this.slots.forEach((slot, i) => {
      const inst = slot.inst;
      if (!inst) return;
      const a = this.anchor(document.querySelector(`.char-pick[data-player="${i}"] .char-emoji`), rootRect);
      inst.root.visible = !!a;
      if (a) {
        const s = (a.height * 0.9) / MODEL_HEIGHT;
        inst.root.scale.setScalar(s);
        inst.root.position.set(a.x, a.bottom + a.height * 0.04, 0);
        inst.root.rotation.y = Math.PI + sway * Math.sin(this.time * 0.0009 + i) * 0.35;
      }
      inst.update(dtMs);
    });
  }

  render(renderer: THREE.WebGLRenderer) {
    if (!this.visible) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, this.w, this.h);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}
