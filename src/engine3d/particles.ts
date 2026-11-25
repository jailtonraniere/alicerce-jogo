import * as THREE from "three";
import type { Assets } from "./assets";

// Sistema de particulas simples: um unico objeto Points por pista (1 chamada de desenho).
// A cor "apaga" ate o preto com a vida; com mistura aditiva, preto = invisivel.

export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private next = 0;
  private alive = 0;

  constructor(
    private readonly capacity: number,
    assets: Assets
  ) {
    this.pos = new Float32Array(capacity * 3).fill(-9999);
    this.col = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.gravity = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.3,
        map: assets.textures.dot,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.points.frustumCulled = false;
  }

  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color: THREE.Color, lifeMs: number, gravity = 0
  ) {
    if (this.capacity === 0) return;
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.life[i] <= 0) this.alive++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.life[i] = lifeMs;
    this.maxLife[i] = lifeMs;
    this.gravity[i] = gravity;
  }

  burst(x: number, y: number, z: number, color: THREE.Color, count: number, speed: number, lifeMs = 650) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, up * s, Math.sin(a) * s, color, lifeMs * (0.6 + Math.random() * 0.4), 9);
    }
  }

  // dz: deslocamento do mundo neste quadro (as particulas acompanham o chao)
  update(dtMs: number, dz: number) {
    if (this.alive === 0) return;
    const dt = dtMs / 1000;
    const { pos, vel, col, base, life, maxLife, gravity } = this;
    for (let i = 0; i < this.capacity; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dtMs;
      const j = i * 3;
      if (life[i] <= 0) {
        this.alive--;
        col[j] = col[j + 1] = col[j + 2] = 0;
        pos[j + 1] = -9999;
        continue;
      }
      vel[j + 1] -= gravity[i] * dt;
      vel[j] *= 0.985;
      vel[j + 2] *= 0.985;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt + dz;
      const k = life[i] / maxLife[i];
      col[j] = base[j] * k;
      col[j + 1] = base[j + 1] * k;
      col[j + 2] = base[j + 2] * k;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
