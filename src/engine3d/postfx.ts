import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { Pass } from "three/addons/postprocessing/Pass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { QualitySettings } from "./quality";

// Pos-processamento: brilho (bloom) sobre o que tem cor acima do limiar.
// So "acende" o que usamos com intensidade > 1 (trilhas, itens, holograma),
// o resto da cena fica limpo. Sem bloom (qualidade baixa), desenha direto na tela.

// x e width em fracao (0..1). before(): chamado antes de desenhar esta vista
// (usado para esconder a pista do outro jogador e economizar processamento).
export type View = { camera: THREE.Camera; x: number; width: number; before?: () => void };

const BLOOM = { strength: 0.55, radius: 0.3, threshold: 0.9 };

// Desenha 1 ou 2 cameras lado a lado no mesmo buffer (modo 2 jogadores).
class MultiViewRenderPass extends Pass {
  views: View[] = [];

  constructor(private readonly scene: THREE.Scene) {
    super();
    this.needsSwap = false;
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const W = read.width;
    const H = read.height;
    for (const v of this.views) {
      const x = Math.round(v.x * W);
      const w = Math.round(v.width * W);
      read.viewport.set(x, 0, w, H);
      read.scissor.set(x, 0, w, H);
      read.scissorTest = true;
      renderer.setRenderTarget(read);
      v.before?.();
      renderer.render(this.scene, v.camera);
    }
    read.viewport.set(0, 0, W, H);
    read.scissor.set(0, 0, W, H);
    read.scissorTest = false;
    renderer.setRenderTarget(read);
  }
}

export class PostFx {
  private composer: EffectComposer | null = null;
  private renderPass: MultiViewRenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private quality: QualitySettings
  ) {
    this.build();
  }

  setQuality(q: QualitySettings) {
    this.quality = q;
    this.build();
    this.setSize(this.width, this.height);
  }

  private build() {
    this.composer?.dispose();
    this.bloom?.dispose();
    this.composer = null;
    this.bloom = null;
    this.renderPass = null;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    if (!this.quality.bloom) return;

    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: this.quality.msaa,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(pr);
    this.renderPass = new MultiViewRenderPass(this.scene);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
  }

  // Reforco temporario do brilho (turbo).
  setBoost(k: number) {
    if (this.bloom) this.bloom.strength = BLOOM.strength + 0.35 * k;
  }

  render(views: View[]) {
    if (this.composer && this.renderPass) {
      this.renderPass.views = views;
      this.composer.render();
      return;
    }
    const { renderer, width: W, height: H } = this;
    renderer.setScissorTest(views.length > 1);
    for (const v of views) {
      const x = Math.round(v.x * W);
      const w = Math.round(v.width * W);
      renderer.setViewport(x, 0, w, H);
      renderer.setScissor(x, 0, w, H);
      v.before?.();
      renderer.render(this.scene, v.camera);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  }

  dispose() {
    this.composer?.dispose();
    this.bloom?.dispose();
  }
}
