import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { WORLD } from "./assets";

// Personagens 3D (Quaternius, Ultimate Modular Men/Women, CC0), preparados por
// tools/build-characters.mjs. Cada arquivo e baixado so quando o personagem e usado.

export type ClipName = "Run" | "Idle" | "Roll" | "Death" | "Wave";

export type CharacterAsset = {
  scene: THREE.Object3D;
  clips: Map<ClipName, THREE.AnimationClip>;
  scale: number;
};

// As cores das roupas (paleta da marca) ja vem gravadas nos vertices pelo
// tools/build-characters.mjs, que tambem une o personagem numa malha so.

export const MODEL_HEIGHT = WORLD.playerHeight * 1.25; // um pouco maior que a capsula, para ler bem no celular

const cache = new Map<string, Promise<CharacterAsset | null>>();
const loader = new GLTFLoader();

export function loadCharacter(id: string): Promise<CharacterAsset | null> {
  let p = cache.get(id);
  if (!p) {
    const url = `${import.meta.env.BASE_URL}models/${id}.glb`;
    p = loader
      .loadAsync(url)
      .then((gltf) => prepare(gltf.scene, gltf.animations))
      .catch((err) => {
        console.warn(`Personagem 3D "${id}" indisponivel, usando o provisorio.`, err);
        return null;
      });
    cache.set(id, p);
  }
  return p;
}

// Leve luz propria (18% da cor de cada vertice) para as sombras nao sumirem no fundo escuro.
function addVertexColorGlow(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance += vColor.rgb * 0.18;\n#endif"
    );
  };
  m.customProgramCacheKey = () => "personagem-brilho";
}

function prepare(scene: THREE.Object3D, animations: THREE.AnimationClip[]): CharacterAsset {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false; // malha com esqueleto: a caixa de recorte nao acompanha a animacao
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats as THREE.MeshStandardMaterial[]) {
      m.vertexColors = true;
      m.metalness = 0;
      m.roughness = 0.7;
      addVertexColorGlow(m);
    }
  });

  // altura real na pose de repouso -> escala para a altura do jogador
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const height = Math.max(0.001, box.max.y - box.min.y);

  const clips = new Map<ClipName, THREE.AnimationClip>();
  for (const c of animations) clips.set(c.name as ClipName, c);
  return { scene, clips, scale: MODEL_HEIGHT / height };
}

// Instancia independente (esqueleto proprio) com o seu mixer de animacao.
export class CharacterInstance {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName: ClipName | "Jump" | null = null;
  private greetLeftMs = 0;

  constructor(asset: CharacterAsset) {
    const model = SkeletonUtils.clone(asset.scene);
    model.scale.setScalar(asset.scale);
    model.rotation.y = Math.PI; // de costas para a camera, correndo para o fundo
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of asset.clips) this.actions.set(name, this.mixer.clipAction(clip));
    const death = this.actions.get("Death");
    if (death) {
      death.setLoop(THREE.LoopOnce, 1);
      death.clampWhenFinished = true;
    }
  }

  private fadeTo(name: ClipName, fade = 0.12) {
    const next = this.actions.get(name);
    if (!next) return null;
    if (this.current !== next) {
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (this.current) next.crossFadeFrom(this.current, fade, false);
      next.play();
      this.current = next;
    }
    return next;
  }

  idle() {
    if (this.currentName === "Idle") return;
    this.currentName = "Idle";
    this.fadeTo("Idle", 0.25)?.setEffectiveTimeScale(1);
  }

  run(speedFactor: number) {
    const a = this.currentName === "Run" ? this.actions.get("Run")! : this.fadeTo("Run");
    this.currentName = "Run";
    if (a) {
      a.paused = false;
      a.setEffectiveTimeScale(speedFactor);
    }
  }

  // Pulo: os pacotes nao tem animacao de pulo; congela a passada no ponto de maior abertura.
  jump() {
    if (this.currentName === "Jump") return;
    const a = this.fadeTo("Run", 0.08);
    this.currentName = "Jump";
    if (a) {
      a.time = a.getClip().duration * 0.3;
      a.setEffectiveTimeScale(0.15);
    }
  }

  // Abaixar: cambalhota curta, ajustada para caber na janela de abaixar.
  roll(windowMs: number) {
    if (this.currentName === "Roll") return;
    const a = this.fadeTo("Roll", 0.06);
    this.currentName = "Roll";
    if (a) a.setEffectiveTimeScale(a.getClip().duration / (windowMs / 1000));
  }

  die() {
    if (this.currentName === "Death") return;
    this.currentName = "Death";
    this.fadeTo("Death", 0.1)?.setEffectiveTimeScale(1.2);
  }

  // Aceno de saudacao (tela de inicio), depois volta a ficar parado.
  greet() {
    const a = this.actions.get("Wave");
    if (!a) return this.idle();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    this.fadeTo("Wave", 0.2);
    this.currentName = "Wave";
    this.greetLeftMs = a.getClip().duration * 1000 - 200;
  }

  update(dtMs: number) {
    if (this.greetLeftMs > 0) {
      this.greetLeftMs -= dtMs;
      if (this.greetLeftMs <= 0) this.idle();
    }
    this.mixer.update(dtMs / 1000);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot()); // libera os dados de animacao desta instancia
    this.root.removeFromParent();
  }
}
