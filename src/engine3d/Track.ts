import * as THREE from "three";
import { TUNING } from "../config";
import { HEX } from "../theme";
import type { Character } from "../types";
import { PLAYER_Y, type RunnerSim } from "../sim/RunnerSim";
import { Assets, WORLD } from "./assets";
import { Scenery, freeze } from "./scenery";
import { HoloMap } from "./HoloMap";
import { Particles } from "./particles";
import { buildEntity, animateEntity, entityData } from "./entities";
import { CharacterInstance, loadCharacter } from "./characters";
import type { GameAudio } from "./audio";
import { vibrate } from "./haptics";
import type { QualitySettings } from "./quality";

// Uma pista 3D com o seu jogador, cenario, holograma do mapa e camera. No modo
// 2 jogadores existem duas, lado a lado (longe o bastante para uma nao aparecer na outra).

const CAMERA_ELEVATION = THREE.MathUtils.degToRad(24);
const LOOK_AHEAD_Z = -10; // jogador fica a ~75% da altura da tela, como no 2D
const SPAWN_IN_MS = 220;
const COLLECT_POP_MS = 160;
const SPEED_LINES = 18;
const INTRO_MS = 1700; // entrada de camera (cabe na contagem de 2,8 s)

const C_CYAN = new THREE.Color(HEX.accent).multiplyScalar(2.4);
const C_WHITE = new THREE.Color(0xdff6ff).multiplyScalar(2.6);
const C_AMBER = new THREE.Color(HEX.amber).multiplyScalar(2.2);

const smooth = (dtMs: number, tauMs: number) => 1 - Math.exp(-dtMs / tauMs);

type Dying = { obj: THREE.Object3D; t: number };

export class Track {
  readonly group = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 420);
  camDist = 14;

  private readonly scenery: Scenery;
  private readonly map: HoloMap;
  private readonly particles: Particles;

  private readonly player = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly ring: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private readonly shield = new THREE.Group();
  private readonly magnet = new THREE.Group();
  private readonly blob: THREE.Mesh;
  private readonly speedLines: THREE.InstancedMesh;
  private readonly speedMat: THREE.MeshBasicMaterial;
  private readonly speedPos: THREE.Vector3[] = [];

  private readonly meshes = new Map<number, THREE.Object3D>();
  private dying: Dying[] = [];
  private model: CharacterInstance | null = null;
  private disposed = false;
  private audio: GameAudio | null = null;
  private pan = 0;
  private prevJump = 0;
  private prevDuck = 0;
  private prevMunicipios = 0;
  private introMs = -1;

  private visualX = 0;
  private distance = 0;
  private time = 0;
  private crashT = -1;
  private fovBase = 60;
  private fovKick = 0;
  private shake = 0;
  private trailAcc = 0;
  private readonly target = new THREE.Vector3();
  private readonly dummy = new THREE.Object3D();

  constructor(
    readonly sim: RunnerSim,
    readonly offsetX: number,
    character: Character,
    private readonly assets: Assets,
    quality: QualitySettings,
    maxAnisotropy: number,
    private readonly reducedMotion: boolean,
    private readonly onModelReady?: () => void
  ) {
    const { geo, mat } = assets;

    this.scenery = new Scenery(offsetX, assets, quality, maxAnisotropy);
    this.map = new HoloMap(offsetX, assets);
    this.particles = new Particles(Math.round(260 * quality.particles), assets);
    this.group.add(this.scenery.group, this.map.group, this.particles.points);

    // jogador (provisorio ate a fase 3): capsula, anel de luz, emoji do personagem
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: HEX.highlight,
      emissive: 0x0d3a66,
      emissiveIntensity: 0.7,
      roughness: 0.35,
      metalness: 0.25,
    });
    this.body = new THREE.Mesh(geo.player, this.bodyMat);
    this.ring = new THREE.Mesh(geo.ring, mat.playerRing);
    this.ring.rotation.x = Math.PI / 2;
    this.label = new THREE.Sprite(assets.emoji(character.emoji));
    this.label.scale.setScalar(0.95);

    // escudo: bolha com brilho nas bordas + malha geodesica
    this.shield.add(new THREE.Mesh(geo.shield, mat.shield), new THREE.Mesh(geo.shieldWire, mat.shieldWire));
    this.shield.position.y = WORLD.playerHeight / 2;
    this.shield.visible = false;

    // ima: dois aneis girando em volta do jogador
    for (const y of [0.45, 1.25]) {
      const r = new THREE.Mesh(geo.magnetRing, mat.magnet);
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      this.magnet.add(r);
    }
    this.magnet.visible = false;

    this.player.add(this.body, this.ring, this.label, this.shield, this.magnet);
    this.group.add(this.player);

    this.blob = new THREE.Mesh(geo.blob, mat.blob);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.012;
    this.group.add(this.blob);

    // linhas de velocidade (turbo)
    this.speedMat = mat.speedLine.clone();
    this.speedMat.opacity = 0;
    this.speedLines = new THREE.InstancedMesh(geo.speedLine, this.speedMat, SPEED_LINES);
    for (let i = 0; i < SPEED_LINES; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.speedPos.push(
        new THREE.Vector3(offsetX + side * (3 + Math.random() * 5), 0.4 + Math.random() * 5, -30 + Math.random() * 40)
      );
    }
    this.speedLines.visible = false;
    this.group.add(this.speedLines);
    [this.group, this.particles.points, this.speedLines].forEach(freeze);

    this.visualX = this.laneWorldX(sim.laneX(sim.lane));
    this.updatePlayer(0, false, 0);

    // Personagem 3D: enquanto carrega, fica a capsula provisoria.
    void loadCharacter(character.id).then((asset) => {
      if (asset && !this.disposed) this.setModel(new CharacterInstance(asset));
    });
  }

  private setModel(model: CharacterInstance) {
    this.model = model;
    this.body.visible = false;
    this.label.visible = false;
    // o anel de luz vira uma base discreta do personagem, no chao
    this.ring.material = this.assets.mat.baseRing;
    this.ring.position.y = 0.04;
    this.ring.scale.setScalar(1.15);
    this.player.add(model.root);
    model.idle();
    model.update(0);
    this.onModelReady?.();
  }

  get turboLevel() {
    return this.fovKick / 9;
  }

  // Som desta pista (no modo 2 jogadores, cada um de um lado do estereo).
  setAudio(audio: GameAudio | null, pan: number) {
    this.audio = audio;
    this.pan = pan;
  }

  // Cenario parado da tela de inicio: sem jogador, so o mundo andando devagar.
  setPlayerVisible(v: boolean) {
    this.player.visible = v;
    this.blob.visible = v;
  }

  idleTick(dtMs: number, speedPx: number) {
    this.time += dtMs;
    const dz = speedPx * (dtMs / 1000) * WORLD.pxToZ;
    this.distance += dz;
    this.scenery.update(dtMs, dz, this.distance);
    this.map.update(dtMs);
    this.updateCamera(dtMs);
  }

  // Entrada de camera durante a contagem: comeca alta e afastada e desce ate a pista.
  playIntro() {
    if (!this.reducedMotion) this.introMs = 0;
  }

  // x em px da logica -> x no mundo (centro da pista do meio = 0)
  private laneWorldX(xPx: number) {
    const laneWidthPx = this.sim.width / this.sim.lanes;
    return (xPx / laneWidthPx - this.sim.lanes / 2) * WORLD.laneSpacing;
  }

  // y em px da logica -> z no mundo (jogador em z = 0, itens vem de z negativo)
  private zOf(yPx: number) {
    return (yPx - PLAYER_Y) * WORLD.pxToZ;
  }

  // Ajusta a distancia da camera para as 3 pistas caberem na largura da tela
  // na altura do jogador (a camera mira um ponto a frente dele).
  fit(aspect: number) {
    this.camera.aspect = aspect;
    this.fovBase = aspect < 1 ? 62 : 50;
    const halfWidth = (WORLD.laneSpacing * this.sim.lanes) / 2 + 0.5;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.fovBase / 2)) * aspect;
    const toPlayer = halfWidth / tanH;
    const lookAhead = Math.abs(LOOK_AHEAD_Z) * Math.cos(CAMERA_ELEVATION);
    this.camDist = THREE.MathUtils.clamp(toPlayer + lookAhead, 12, 42);
    const kick = this.fovKick;
    this.fovKick = 0;
    this.updateCamera(0);
    this.map.place(this.camera);
    this.fovKick = kick;
    this.updateCamera(0);
  }

  update(dtMs: number, baseSpeed: number, running: boolean) {
    this.time += dtMs;
    const moving = running && this.sim.alive;
    const speedPx = moving ? this.sim.currentSpeed(baseSpeed) : 0;
    const dz = speedPx * (dtMs / 1000) * WORLD.pxToZ;
    this.distance += dz;

    this.consumeEvents();

    // itens e obstaculos
    for (const e of this.sim.entities) {
      const obj = this.meshes.get(e.id);
      if (!obj) continue;
      obj.position.x = this.offsetX + this.laneWorldX(e.x);
      obj.position.z = this.zOf(e.y);
      const d = entityData(obj);
      d.age += dtMs;
      const s = Math.min(1, d.age / SPAWN_IN_MS);
      obj.scale.setScalar(Math.max(0.001, s * s * (3 - 2 * s)));
      animateEntity(obj, dtMs, this.time, this.reducedMotion);
    }

    // coletados: "pop" rapido antes de sumir
    this.dying = this.dying.filter((d) => {
      d.t += dtMs;
      d.obj.scale.setScalar(1 + (d.t / COLLECT_POP_MS) * 0.9);
      d.obj.position.y += dtMs * 0.005;
      if (d.t >= COLLECT_POP_MS) {
        this.group.remove(d.obj);
        return false;
      }
      return true;
    });

    this.scenery.update(dtMs, dz, this.distance);
    this.map.setProgress(this.sim.municipios);
    this.map.update(dtMs);
    this.updatePlayer(dtMs, moving, speedPx);
    this.updateEffects(dtMs, dz, moving);
    this.particles.update(dtMs, dz);
    this.updateCamera(dtMs);
  }

  private consumeEvents() {
    for (const ev of this.sim.events) {
      if (ev.type === "spawn") {
        const obj = buildEntity(ev.entity.kind, this.assets);
        obj.scale.setScalar(0.001);
        obj.position.x = this.offsetX + this.laneWorldX(ev.entity.x);
        obj.position.z = this.zOf(ev.entity.y);
        this.meshes.set(ev.entity.id, obj);
        this.group.add(obj);
      } else if (ev.type === "collect") {
        const obj = this.meshes.get(ev.entity.id);
        if (!obj) continue;
        this.meshes.delete(ev.entity.id);
        this.dying.push({ obj, t: 0 });
        const p = obj.position;
        const kind = ev.entity.kind;
        if (kind === "data") {
          this.particles.burst(p.x, p.y, p.z, C_CYAN, 14, 4.5);
          this.audio?.collect(this.pan);
        } else if (kind === "indicator") {
          this.particles.burst(p.x, p.y, p.z, C_WHITE, 24, 5.5, 750);
          this.audio?.indicator(this.pan);
        } else {
          this.particles.burst(p.x, p.y, p.z, C_WHITE, 20, 5, 800);
          this.audio?.power(kind, this.pan);
        }
      } else if (ev.type === "despawn") {
        const obj = this.meshes.get(ev.entity.id);
        if (obj) {
          this.meshes.delete(ev.entity.id);
          this.group.remove(obj);
        }
      } else if (ev.type === "crash") {
        this.crashT = 0;
        this.shake = this.reducedMotion ? 0 : 340;
        const p = this.player.position;
        this.particles.burst(p.x, p.y + 0.9, p.z - 0.4, C_AMBER, 32, 6.5, 800);
        this.audio?.crash(this.pan);
        vibrate(140);
      }
    }
    this.sim.events.length = 0;

    // sons de acao do jogador (pulo, cambalhota) e de municipio conectado
    const s = this.sim;
    if (s.jump > 0 && this.prevJump === 0) this.audio?.jump(this.pan);
    if (s.duck > 0 && this.prevDuck === 0) this.audio?.roll(this.pan);
    if (s.municipios > this.prevMunicipios) {
      this.audio?.municipio(this.pan);
      vibrate(25);
    }
    this.prevJump = s.jump;
    this.prevDuck = s.duck;
    this.prevMunicipios = s.municipios;
  }

  private updatePlayer(dtMs: number, moving: boolean, speedPx: number) {
    const s = this.sim;
    const targetX = this.laneWorldX(s.laneX(s.lane));
    // troca de pista em ~90 ms (TUNING.laneChangeMs), com leve inclinacao
    this.visualX += (targetX - this.visualX) * smooth(dtMs, TUNING.laneChangeMs / 3);
    const lean = THREE.MathUtils.clamp((targetX - this.visualX) * 0.35, -0.35, 0.35);

    let y = 0;
    if (s.jump > 0) {
      const t = 1 - s.jump / TUNING.jumpMs;
      y = Math.sin(Math.PI * t) * WORLD.jumpHeight;
    } else if (moving && !this.model) {
      y = Math.abs(Math.sin(this.time * 0.012)) * 0.07; // passada da capsula
    }

    // personagem 3D: escolhe a animacao pelo estado da logica
    const m = this.model;
    if (m) {
      if (!s.alive) m.die();
      else if (s.duck > 0) m.roll(TUNING.duckMs);
      else if (s.jump > 0) m.jump();
      else if (moving) m.run(THREE.MathUtils.clamp(speedPx / TUNING.baseSpeed, 0.9, 1.8));
      else m.idle();
      m.update(dtMs);
      this.player.position.set(this.offsetX + this.visualX, y, 0);
      this.player.rotation.z = -lean * 0.6;
      this.blob.position.x = this.player.position.x;
      this.blob.scale.setScalar(1 - Math.min(0.6, y / 3));
      return;
    }

    const duckTarget = s.duck > 0 ? WORLD.duckScale : 1;
    const sy = this.body.scale.y + (duckTarget - this.body.scale.y) * smooth(dtMs, 25);
    this.body.scale.y = sy;
    this.body.position.y = (WORLD.playerHeight / 2) * sy;
    this.ring.position.y = 0.95 * sy;
    this.label.position.y = WORLD.playerHeight * sy + 0.55;

    this.player.position.set(this.offsetX + this.visualX, y, 0);
    this.player.rotation.z = -lean;

    if (this.crashT >= 0) {
      this.crashT += dtMs;
      const k = Math.min(1, this.crashT / 220);
      this.player.rotation.x = -0.6 * k;
      this.bodyMat.color.setHex(HEX.amber);
      this.bodyMat.emissive.setHex(0x5a2a00);
    }

    this.blob.position.x = this.player.position.x;
    this.blob.scale.setScalar(1 - Math.min(0.6, y / 3));
  }

  private updateEffects(dtMs: number, dz: number, moving: boolean) {
    const s = this.sim;
    const p = this.player.position;

    // escudo (pisca no ultimo segundo)
    const shieldOn = s.shield > 0 && s.alive;
    this.shield.visible = shieldOn && (s.shield > 1000 || Math.floor(this.time / 110) % 2 === 0);
    if (this.shield.visible) {
      this.shield.rotation.y += dtMs * 0.0012;
      this.shield.position.y = (WORLD.playerHeight / 2) * this.body.scale.y + 0.05;
    }

    // ima
    this.magnet.visible = s.magnet > 0 && s.alive;
    if (this.magnet.visible) {
      this.magnet.children.forEach((r, i) => {
        r.rotation.z += dtMs * (i === 0 ? 0.004 : -0.005);
        r.scale.setScalar(1 + 0.12 * Math.sin(this.time * 0.01 + i * 1.7));
      });
      if (Math.random() < dtMs / 60) {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit(p.x + Math.cos(a) * 1.6, 0.8 + Math.random(), p.z + Math.sin(a) * 1.6,
          -Math.cos(a) * 2.2, 0, -Math.sin(a) * 2.2, C_CYAN, 500);
      }
    }

    // turbo: rastro e linhas de velocidade
    const turbo = s.turbo > 0 && moving;
    if (turbo) {
      this.trailAcc += dtMs;
      while (this.trailAcc > 16) {
        this.trailAcc -= 16;
        this.particles.emit(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.2 + Math.random() * 1.1, p.z + 0.3,
          (Math.random() - 0.5) * 0.6, 0.2, 2.5, C_CYAN, 420);
      }
    }
    const k = this.turboLevel;
    this.speedLines.visible = k > 0.02;
    if (this.speedLines.visible) {
      this.speedMat.opacity = 0.6 * k;
      for (let i = 0; i < SPEED_LINES; i++) {
        const v = this.speedPos[i];
        v.z += dz * 3 + (dtMs / 1000) * 30;
        if (v.z > 14) v.z -= 44;
        this.dummy.position.copy(v);
        this.dummy.updateMatrix();
        this.speedLines.setMatrixAt(i, this.dummy.matrix);
      }
      this.speedLines.instanceMatrix.needsUpdate = true;
    }
  }

  private updateCamera(dtMs: number) {
    const s = this.sim;
    const turboOn = s.turbo > 0 && s.alive;
    this.fovKick += ((turboOn ? 9 : 0) - this.fovKick) * smooth(dtMs, 180);
    this.camera.fov = this.fovBase + this.fovKick;

    // entrada: comeca alta, afastada e de lado; assenta com desaceleracao
    let d = this.camDist;
    let elev = CAMERA_ELEVATION;
    let swing = 0;
    if (this.introMs >= 0) {
      this.introMs += dtMs;
      const t = Math.min(1, this.introMs / INTRO_MS);
      const k = 1 - Math.pow(1 - t, 3);
      d *= 1 + 0.9 * (1 - k);
      elev += THREE.MathUtils.degToRad(16) * (1 - k);
      swing = 4 * (1 - k);
      if (t >= 1) this.introMs = -1;
    }
    const tx = this.offsetX + this.visualX * 0.3;
    this.target.set(tx, 0.4, LOOK_AHEAD_Z);
    this.camera.position.set(
      tx + swing,
      this.target.y + Math.sin(elev) * d,
      this.target.z + Math.cos(elev) * d
    );
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dtMs);
      const amp = 0.24 * (this.shake / 340);
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp;
    }
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.model?.dispose();
    this.group.removeFromParent();
    this.scenery.dispose();
    this.map.dispose();
    this.particles.dispose();
    this.speedLines.dispose();
    this.speedMat.dispose();
    this.bodyMat.dispose();
    this.meshes.clear();
    this.dying = [];
  }
}
