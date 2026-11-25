import * as THREE from "three";
import { Assets, WORLD } from "./assets";
import { circuitGround, apronGrid } from "./textures";
import type { QualitySettings } from "./quality";

// Cenario de uma pista: placa de circuito, trilhos de luz, arcos hexagonais,
// torres de dados nas laterais, pulsos de dados correndo para o horizonte e
// particulas no ar. Tudo instanciado (poucas chamadas de desenho).

const NEAR_WRAP_Z = 18; // quando passa da camera, volta para o fundo

// Objeto parado: calcula a posicao uma vez e nao recalcula a cada quadro.
export function freeze(o: THREE.Object3D) {
  o.matrixAutoUpdate = false;
  o.updateMatrix();
}

type Mover = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Scenery {
  readonly group = new THREE.Group();

  private readonly groundTex: THREE.CanvasTexture;
  private readonly apronTex: THREE.CanvasTexture;
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly apron: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private readonly posts: THREE.InstancedMesh;
  private readonly arches: THREE.InstancedMesh;
  private readonly towers: THREE.InstancedMesh;
  private readonly caps: THREE.InstancedMesh;
  private readonly pulses: THREE.InstancedMesh;
  private readonly motes: THREE.Points;

  private readonly postItems: Mover[] = [];
  private readonly archItems: Mover[] = [];
  private readonly towerItems: Mover[] = [];
  private readonly pulseItems: (Mover & { speed: number })[] = [];

  private readonly dummy = new THREE.Object3D();

  constructor(
    readonly offsetX: number,
    assets: Assets,
    quality: QualitySettings,
    maxAnisotropy: number
  ) {
    const g = this.group;
    const { geo, mat } = assets;
    const halfTrack = (WORLD.laneSpacing * 3) / 2;
    const zCenter = -WORLD.trackLength / 2 + NEAR_WRAP_Z;
    const rand = rng(Math.round(offsetX) + 3);

    // placa de circuito (sem iluminacao: as cores ficam exatas e o brilho vem do bloom)
    this.groundTex = circuitGround(maxAnisotropy);
    this.groundTex.repeat.set(1, WORLD.trackLength / WORLD.groundTile);
    const groundMat = new THREE.MeshBasicMaterial({ map: this.groundTex });
    groundMat.color.multiplyScalar(1.25);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(halfTrack * 2, WORLD.trackLength), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(offsetX, 0, zCenter);
    g.add(this.ground);

    this.apronTex = apronGrid(maxAnisotropy);
    this.apronTex.repeat.set(60 / WORLD.apronTile, WORLD.trackLength / WORLD.apronTile);
    this.apron = new THREE.Mesh(
      new THREE.PlaneGeometry(60, WORLD.trackLength),
      new THREE.MeshBasicMaterial({ map: this.apronTex })
    );
    this.apron.rotation.x = -Math.PI / 2;
    this.apron.position.set(offsetX, -0.03, zCenter);
    g.add(this.apron);

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(geo.rail, mat.rail);
      rail.position.set(offsetX + side * (halfTrack + 0.1), 0.05, zCenter);
      g.add(rail);
      freeze(rail);
    }

    // postes baixos na beira da pista
    for (let i = 0; i < WORLD.postCount; i++) {
      for (const side of [-1, 1]) {
        this.postItems.push({
          x: offsetX + side * (halfTrack + 0.7),
          y: 0.65,
          z: NEAR_WRAP_Z - i * WORLD.postSpacing,
          sx: 1,
          sy: 1,
          sz: 1,
          ry: 0,
        });
      }
    }
    this.posts = new THREE.InstancedMesh(geo.post, mat.post, this.postItems.length);
    g.add(this.posts);

    // arcos hexagonais sobre a pista
    for (let i = 0; i < WORLD.archCount; i++) {
      this.archItems.push({ x: offsetX, y: 0, z: -8 - i * WORLD.archSpacing, sx: 1, sy: 1, sz: 1, ry: 0 });
    }
    this.arches = new THREE.InstancedMesh(geo.arch, mat.arch, this.archItems.length);
    g.add(this.arches);

    // torres de dados (prismas hexagonais) nas laterais
    const towerCount = Math.round(WORLD.towerCount * quality.scenery);
    const spacing = (WORLD.towerCount * WORLD.towerSpacing) / towerCount;
    for (let i = 0; i < towerCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const r = 0.8 + rand() * 1.1;
      this.towerItems.push({
        x: offsetX + side * (halfTrack + 4 + rand() * 12),
        y: 0,
        z: NEAR_WRAP_Z - i * spacing - rand() * 3,
        sx: r,
        sy: 2.5 + rand() * rand() * 14,
        sz: r,
        ry: 0,
      });
    }
    this.towers = new THREE.InstancedMesh(geo.tower, mat.tower, this.towerItems.length);
    this.caps = new THREE.InstancedMesh(geo.towerCap, mat.towerCap, this.towerItems.length);
    g.add(this.towers, this.caps);

    // pulsos de dados correndo nos separadores e bordas, rumo ao horizonte
    const lines = [-halfTrack, -halfTrack / 3, halfTrack / 3, halfTrack];
    for (let i = 0; i < WORLD.pulseCount; i++) {
      this.pulseItems.push({
        x: offsetX + lines[i % lines.length],
        y: 0.04,
        z: NEAR_WRAP_Z - rand() * 70,
        sx: 1,
        sy: 1,
        sz: 0.6 + rand() * 0.9,
        ry: 0,
        speed: 14 + rand() * 16,
      });
    }
    this.pulses = new THREE.InstancedMesh(geo.pulse, mat.pulse, this.pulseItems.length);
    g.add(this.pulses);

    // poeira de dados no ar
    const moteCount = Math.round(140 * quality.particles);
    const pos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      pos[i * 3] = offsetX + (rand() - 0.5) * 34;
      pos[i * 3 + 1] = 0.4 + rand() * 9;
      pos[i * 3 + 2] = NEAR_WRAP_Z - rand() * 80;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const moteMat = new THREE.PointsMaterial({
      size: 0.13,
      map: assets.textures.dot,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    moteMat.color.setHex(0x8fd8ff).multiplyScalar(1.4);
    this.motes = new THREE.Points(moteGeo, moteMat);
    g.add(this.motes);

    this.syncAll();
    [this.group, this.ground, this.apron, this.posts, this.arches, this.towers, this.caps, this.pulses, this.motes].forEach(freeze);
  }

  // dz: quanto o mundo andou em direcao a camera neste quadro.
  update(dtMs: number, dz: number, distance: number) {
    const dt = dtMs / 1000;
    this.groundTex.offset.y = (distance / WORLD.groundTile) % 1;
    this.apronTex.offset.y = (distance / WORLD.apronTile) % 1;

    if (dz > 0) {
      this.advance(this.postItems, dz, WORLD.postCount * WORLD.postSpacing);
      this.advance(this.archItems, dz, WORLD.archCount * WORLD.archSpacing);
      this.advance(this.towerItems, dz, WORLD.towerCount * WORLD.towerSpacing);
      const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let z = pos.getZ(i) + dz * 1.15;
        if (z > NEAR_WRAP_Z) z -= 80;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }

    // pulsos andam para longe (contra o fluxo), mais rapido quando o jogo acelera
    for (const p of this.pulseItems) {
      p.z -= p.speed * dt - dz * 0.3;
      if (p.z < -75) p.z = NEAR_WRAP_Z - Math.random() * 6;
    }
    this.syncAll();
  }

  private advance(items: Mover[], dz: number, wrap: number) {
    for (const it of items) {
      it.z += dz;
      if (it.z > NEAR_WRAP_Z) it.z -= wrap;
    }
  }

  private sync(mesh: THREE.InstancedMesh, items: Mover[], yOffset?: (m: Mover) => number) {
    const d = this.dummy;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      d.position.set(it.x, yOffset ? yOffset(it) : it.y, it.z);
      d.rotation.set(0, it.ry, 0);
      d.scale.set(it.sx, yOffset ? 1 : it.sy, it.sz);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private syncAll() {
    this.sync(this.posts, this.postItems);
    this.sync(this.arches, this.archItems);
    this.sync(this.towers, this.towerItems);
    this.sync(this.caps, this.towerItems, (t) => t.sy + 0.02);
    this.sync(this.pulses, this.pulseItems);
  }

  dispose() {
    this.group.removeFromParent();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.apron.geometry.dispose();
    this.apron.material.dispose();
    this.groundTex.dispose();
    this.apronTex.dispose();
    this.motes.geometry.dispose();
    (this.motes.material as THREE.Material).dispose();
    for (const m of [this.posts, this.arches, this.towers, this.caps, this.pulses]) m.dispose();
  }
}
