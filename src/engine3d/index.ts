import * as THREE from "three";
import "./hud.css";
import { bus, CHARACTERS, TUNING } from "../config";
import { GameSim, type CountdownLabel } from "../sim/GameSim";
import type { GameEngine, MenuState } from "../engine";
import type { GameConfig } from "../types";
import { Assets, SKY_HORIZON } from "./assets";
import { Track } from "./Track";
import { Hud, type EngineStats } from "./hud";
import { attachInput } from "./input";
import { PostFx } from "./postfx";
import { Menu } from "./menu";
import { GameAudio } from "./audio";
import { loadCharacter } from "./characters";
import {
  QUALITY,
  initialQuality,
  lowerQuality,
  higherQuality,
  rememberQuality,
  type QualityName,
} from "./quality";

// Motor 3D: Three.js desenhando a mesma logica do jogo 2D, com cenario,
// holograma do mapa, personagens animados, particulas, brilho (bloom), audio
// sintetizado e a tela de inicio com logo 3D e personagens.

const MAX_DT_MS = 50;
const QUALITY_SAMPLE_START_MS = 2000;
const QUALITY_SAMPLE_MS = 2500;
const QUALITY_MIN_FPS = 45;
const QUALITY_UPGRADE_FPS = 57;
const MENU_SCROLL_PX = 110; // velocidade do cenario atras da tela de inicio
const MENU_FRAME_MS = 31; // ~30 fps na tela de inicio
const EXPOSURE = 1.05;
const MENU_EXPOSURE = 0.5; // cenario escurecido atras da tela de inicio

export function createEngine(root: HTMLElement): GameEngine {
  return new Engine3D(root);
}

class Engine3D implements GameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly fog: THREE.Fog;
  private readonly sky: THREE.Mesh;
  private readonly assets = new Assets();
  private readonly hud: Hud;
  private readonly post: PostFx;
  private readonly menu: Menu;
  private readonly maxAnisotropy: number;
  private readonly debug = new URLSearchParams(location.search).has("debug");
  private readonly reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  private quality: QualityName;
  private readonly qualityForced: boolean;
  private sim: GameSim | null = null;
  private tracks: Track[] = [];
  private detachInput: (() => void) | null = null;
  private audio: GameAudio | null = null;
  private lastCount: CountdownLabel = null;
  private raf = 0;
  private looping: "none" | "menu" | "game" = "none";
  private last = 0;
  private time = 0;

  readonly stats: EngineStats;
  private fpsFrames = 0;
  private fpsAcc = 0;
  private cpuAcc = 0;
  private sampleFrames = 0;
  private sampleAcc = 0;
  private sampleDone = false;
  private triedUpgrade = false;

  constructor(private readonly root: HTMLElement) {
    const q = initialQuality();
    this.quality = q.name;
    this.qualityForced = q.forced;
    this.triedUpgrade = q.saved; // nivel ja salvo neste aparelho: nao testa de novo

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.info.autoReset = false; // conta as chamadas do quadro inteiro (cena + pos-processamento)
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    root.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(SKY_HORIZON);
    this.fog = new THREE.Fog(SKY_HORIZON, 25, 60);
    this.scene.fog = this.fog;
    this.scene.matrixWorldAutoUpdate = false; // atualizado uma vez por quadro em render()
    this.scene.add(new THREE.HemisphereLight(0x9fdcff, 0x06121f, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 6);
    this.scene.add(sun);
    // luz de contorno ciano vinda do fundo: desenha a silhueta dos personagens
    const rim = new THREE.DirectionalLight(0x7fd4ff, 2.2);
    rim.position.set(-3, 7, -12);
    this.scene.add(rim);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 16), this.assets.mat.sky);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.post = new PostFx(this.renderer, this.scene, QUALITY[this.quality]);
    this.menu = new Menu(this.renderer, root, this.reducedMotion);
    this.stats = { fps: 0, cpuMs: 0, calls: 0, pixelRatio: this.renderer.getPixelRatio(), quality: this.quality };

    this.hud = new Hud(root, this.debug);
    if (this.debug) (window as unknown as { __alicerce3d: EngineStats }).__alicerce3d = this.stats;

    new ResizeObserver(() => this.resize()).observe(root);

    // Cenario atras da tela de inicio (sem jogador; o menu mostra os personagens).
    this.build({ mode: "single", characterP1: CHARACTERS[0], characterP2: CHARACTERS[1], sound: false });
    this.tracks[0].setPlayerVisible(false);
    this.hud.setVisible(false);
    this.resize();
  }

  // ---- tela de inicio ----

  showMenu(state: MenuState) {
    if (this.looping === "game") return;
    this.menu.show(state);
    this.hud.setVisible(false);
    this.runLoop("menu");
  }

  // Tela de inicio a ~30 fps: fica aberta muito tempo no estande, entao poupa bateria.
  private menuLoop = (now: number) => {
    if (this.looping !== "menu") return;
    this.raf = requestAnimationFrame(this.menuLoop);
    if (now - this.last < MENU_FRAME_MS) return;
    const dt = this.tick(now);
    for (const t of this.tracks) t.idleTick(dt, MENU_SCROLL_PX);
    this.menu.update(dt);
    this.render(true);
    this.prefetchCharacters();
  };

  // Baixa os outros personagens com calma, depois que a tela de inicio ja apareceu:
  // a troca de personagem fica instantanea e tudo vai para o cache offline.
  private prefetched = false;
  private prefetchCharacters() {
    if (this.prefetched || this.time < 2500) return;
    this.prefetched = true;
    CHARACTERS.forEach((c, i) => window.setTimeout(() => void loadCharacter(c.id), i * 400));
  }

  // ---- partida ----

  start(cfg: GameConfig) {
    this.menu.hide();
    this.detachInput?.();
    this.build(cfg);
    this.resize();
    this.hud.setVisible(true);
    this.tracks.forEach((t) => t.playIntro());

    // audio: criado no primeiro inicio com som ligado (o clique ja destravou)
    if (cfg.sound && !this.audio) this.audio = GameAudio.create();
    const audio = cfg.sound ? this.audio : null;
    audio?.stopMusic();
    this.tracks.forEach((t, i) => t.setAudio(audio, this.tracks.length === 2 ? (i === 0 ? -0.6 : 0.6) : 0));
    this.lastCount = null;

    this.detachInput = attachInput(this.root, this.sim!);
    this.sampleFrames = 0;
    this.sampleAcc = 0;
    this.runLoop("game");
  }

  private build(cfg: GameConfig) {
    this.tracks.forEach((t) => t.dispose());
    this.sim = new GameSim(cfg);
    const q = QUALITY[this.quality];
    this.tracks = this.sim.runners.map(
      (r, i) =>
        new Track(
          r,
          i * 80,
          i === 0 ? cfg.characterP1 : cfg.characterP2,
          this.assets,
          q,
          this.maxAnisotropy,
          this.reducedMotion,
          () => {
            // modelo chegou com nada animando: redesenha a cena uma vez
            if (this.looping === "none") this.render(false);
          }
        )
    );
    this.tracks.forEach((t) => this.scene.add(t.group));
    this.sky.position.x = this.tracks.length === 2 ? 40 : 0;
    this.hud.setup(cfg.mode);
    // Modo de teste: ?debug&imune deixa os jogadores imunes a obstaculos.
    if (this.debug && new URLSearchParams(location.search).has("imune")) {
      this.sim.runners.forEach((r) => (r.invulnerable = true));
    }
  }

  private runLoop(kind: "menu" | "game") {
    cancelAnimationFrame(this.raf);
    this.looping = kind;
    this.last = performance.now();
    this.raf = requestAnimationFrame(kind === "menu" ? this.menuLoop : this.loop);
  }

  private tick(now: number) {
    const dt = Math.min(MAX_DT_MS, Math.max(0, now - this.last));
    this.last = now;
    this.time += dt;
    (this.assets.mat.shield.uniforms.time as { value: number }).value = this.time / 1000;
    return dt;
  }

  private loop = (now: number) => {
    const dt = this.tick(now);
    const sim = this.sim!;
    const wasRunning = sim.running;
    const cpu0 = performance.now();

    const result = sim.update(dt);
    for (const t of this.tracks) t.update(dt, sim.baseSpeed, sim.running);
    this.post.setBoost(Math.max(...this.tracks.map((t) => t.turboLevel)));
    this.updateAudio(sim, wasRunning);
    this.render(false);
    this.cpuAcc += performance.now() - cpu0;
    this.measure(dt, sim);
    this.hud.update(sim, this.stats);

    if (result) {
      this.detachInput?.();
      this.detachInput = null;
      this.looping = "none";
      this.audio?.stopMusic();
      if (this.tracks[0] && this.sim?.cfg.sound) this.audio?.gameOver();
      bus.emit("gameover", result);
      return; // para o loop ate a proxima partida (economiza bateria)
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private updateAudio(sim: GameSim, wasRunning: boolean) {
    const audio = sim.cfg.sound ? this.audio : null;
    if (!audio) return;
    const c = sim.countdown;
    if (c && c !== this.lastCount) audio.countdown(c);
    this.lastCount = c;
    if (sim.running && !wasRunning) audio.startMusic();
    if (sim.running) {
      audio.setIntensity((sim.baseSpeed - TUNING.baseSpeed) / (TUNING.maxSpeed - TUNING.baseSpeed));
    }
  }

  private render(withMenu: boolean) {
    const n = this.tracks.length;
    this.renderer.info.reset();
    this.renderer.toneMappingExposure = withMenu ? MENU_EXPOSURE : EXPOSURE;
    // matrizes da cena calculadas uma vez por quadro (e nao uma vez por camera)
    this.scene.updateMatrixWorld();
    const solo = (i: number) => () => this.tracks.forEach((t, j) => (t.group.visible = j === i));
    this.post.render(
      this.tracks.map((t, i) => ({ camera: t.camera, x: i / n, width: 1 / n, before: n > 1 ? solo(i) : undefined }))
    );
    if (n > 1) this.tracks.forEach((t) => (t.group.visible = true));
    this.renderer.toneMappingExposure = EXPOSURE;
    if (withMenu) this.menu.render(this.renderer);
    this.stats.calls = this.renderer.info.render.calls;
  }

  // ---- desempenho ----

  private measure(dt: number, sim: GameSim) {
    this.fpsFrames++;
    this.fpsAcc += dt;
    if (this.fpsAcc >= 500) {
      this.stats.fps = Math.round((this.fpsFrames * 1000) / this.fpsAcc);
      // tempo de CPU por quadro (logica + envio do desenho; a GPU nao entra aqui)
      this.stats.cpuMs = Math.round((this.cpuAcc / this.fpsFrames) * 10) / 10;
      this.fpsFrames = 0;
      this.fpsAcc = 0;
      this.cpuAcc = 0;
    }

    // Qualidade automatica: mede o fps no comeco da partida. Abaixo de 45, desce
    // um nivel. Com folga (57+) e sem nivel salvo, tenta subir uma vez. O nivel
    // que funcionou fica salvo para as proximas partidas.
    if (this.qualityForced || this.sampleDone || !sim.running || sim.elapsed < QUALITY_SAMPLE_START_MS) return;
    this.sampleFrames++;
    this.sampleAcc += dt;
    if (this.sampleAcc < QUALITY_SAMPLE_MS) return;
    const avg = (this.sampleFrames * 1000) / this.sampleAcc;
    this.sampleFrames = 0;
    this.sampleAcc = 0;

    if (avg < QUALITY_MIN_FPS) {
      const lower = lowerQuality(this.quality);
      if (lower) {
        this.setQuality(lower);
        if (!this.triedUpgrade) return; // ainda nao testou: mede de novo no novo nivel
      }
      // desceu depois de tentar subir (ou ja esta no minimo): fica aqui
      this.finishSampling();
      return;
    }
    const higher = higherQuality(this.quality);
    if (!this.triedUpgrade && higher && avg >= QUALITY_UPGRADE_FPS) {
      this.triedUpgrade = true;
      this.setQuality(higher); // mede de novo no nivel acima
      return;
    }
    this.finishSampling();
  }

  private finishSampling() {
    this.sampleDone = true;
    rememberQuality(this.quality);
  }

  private setQuality(q: QualityName) {
    this.quality = q;
    this.stats.quality = q;
    this.post.setQuality(QUALITY[q]);
    this.stats.pixelRatio = this.renderer.getPixelRatio();
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.root.clientWidth);
    const h = Math.max(1, this.root.clientHeight);
    this.post.setSize(w, h);
    this.menu.setSize(w, h);
    this.stats.pixelRatio = this.renderer.getPixelRatio();
    const n = this.tracks.length || 1;
    for (const t of this.tracks) t.fit(w / n / h);
    const d = this.tracks[0]?.camDist ?? 14;
    this.fog.near = d + 14;
    this.fog.far = d + 60;
    if (this.looping === "none") this.render(this.menu.visible);
  }
}
