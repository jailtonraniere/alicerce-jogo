import * as THREE from "three";
import { HEX } from "../theme";
import { MAP_NODES, MAP_LINKS, MAP_FULL_AT } from "../util/stateMapData";
import { Assets, glow } from "./assets";

// Mapa do estado em holograma no fim da pista. Mesma rede e mesma regra do mapa 2D:
// acende os nos e ligacoes proporcionalmente aos municipios conectados.

const ASPECT = 2.7; // largura / altura do mapa
const MAP_Z = -82; // distancia a frente do jogador
const PULSE_MS = 900;

const DIM = new THREE.Color(HEX.mapNode).multiplyScalar(0.9);
const LIT = new THREE.Color(HEX.accent).multiplyScalar(2.6);
const LINK_DIM = new THREE.Color(HEX.mapNode).multiplyScalar(0.55);
const LINK_LIT = new THREE.Color(HEX.accent).multiplyScalar(2.2);

export class HoloMap {
  readonly group = new THREE.Group();
  private readonly nodes: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly links: THREE.LineSegments;
  private readonly linkColors: THREE.BufferAttribute;
  private readonly panel: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly ringColor = new THREE.Color();
  private readonly pulses = new Map<number, number>(); // no -> ms decorridos
  private litNodes = -1;
  private litLinks = -1;
  private time = 0;

  constructor(
    private readonly offsetX: number,
    assets: Assets
  ) {
    const noFog = { fog: false };

    // painel de fundo
    const panelMat = new THREE.MeshBasicMaterial({
      map: assets.textures.holoPanel,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      ...noFog,
    });
    panelMat.color.multiplyScalar(1.3);
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(ASPECT * 1.08, 1.12), panelMat);
    this.group.add(this.panel);

    // ligacoes
    const pos = new Float32Array(MAP_LINKS.length * 6);
    MAP_LINKS.forEach(([a, b], i) => {
      const pa = this.local(a);
      const pb = this.local(b);
      pos.set([pa.x, pa.y, 0.002, pb.x, pb.y, 0.002], i * 6);
    });
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.linkColors = new THREE.BufferAttribute(new Float32Array(MAP_LINKS.length * 6), 3);
    linkGeo.setAttribute("color", this.linkColors);
    this.links = new THREE.LineSegments(
      linkGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        ...noFog,
      })
    );
    this.group.add(this.links);

    // nos (municipios)
    this.nodes = new THREE.InstancedMesh(
      assets.geo.mapNode,
      new THREE.MeshBasicMaterial({ ...noFog, depthWrite: false }),
      MAP_NODES.length
    );
    this.ringMat = glow(0xffffff, 1, {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      ...noFog,
    });
    this.rings = new THREE.InstancedMesh(assets.geo.mapRing, this.ringMat, MAP_NODES.length);
    this.group.add(this.nodes, this.rings);
    for (const o of [this.panel, this.links, this.nodes, this.rings]) {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    }
    this.group.matrixAutoUpdate = false;

    this.setProgress(0, false);
    this.syncInstances();
  }

  private local(i: number) {
    const n = MAP_NODES[i];
    return new THREE.Vector2((n.x - 0.5) * ASPECT, (0.5 - n.y) * 1.0);
  }

  // Posiciona o mapa para ocupar a faixa de ceu no topo da tela, entre a borda
  // de cima (~8%) e o horizonte, cabendo na largura.
  place(camera: THREE.PerspectiveCamera) {
    camera.updateMatrixWorld();
    const hit = (ndcX: number, ndcY: number) => {
      const p = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
      const dir = p.sub(camera.position).normalize();
      const t = (MAP_Z - camera.position.z) / dir.z;
      return camera.position.clone().addScaledVector(dir, t);
    };
    const top = hit(0, 0.84).y;
    const halfVisible = Math.abs(hit(1, 0.5).x - camera.position.x);
    const baseY = 0.8;
    let h = Math.max(2, top - baseY);
    const w = Math.min(h * ASPECT * 1.08, halfVisible * 2 * 0.92);
    h = w / (ASPECT * 1.08);
    this.group.scale.setScalar(h / 1.12);
    this.group.position.set(this.offsetX, baseY + h / 2, MAP_Z);
    // matriz atualizada antes de mirar: o lookAt parte da posicao ja calculada
    this.group.updateMatrix();
    this.group.lookAt(this.offsetX, camera.position.y * 0.6, camera.position.z);
    this.group.updateMatrix();
  }

  // municipios conectados -> nos e ligacoes acesos (regra do mapa 2D)
  setProgress(municipios: number, animate = true) {
    const ratio = Math.min(1, municipios / MAP_FULL_AT);
    const nodes = Math.round(ratio * MAP_NODES.length);
    const links = Math.round(ratio * MAP_LINKS.length);
    if (nodes === this.litNodes && links === this.litLinks) return false;

    if (animate) for (let i = Math.max(0, this.litNodes); i < nodes; i++) this.pulses.set(i, 0);
    const grew = nodes > this.litNodes && this.litNodes >= 0;
    this.litNodes = nodes;
    this.litLinks = links;

    for (let i = 0; i < MAP_NODES.length; i++) this.nodes.setColorAt(i, i < nodes ? LIT : DIM);
    this.nodes.instanceColor!.needsUpdate = true;
    for (let i = 0; i < MAP_LINKS.length; i++) {
      const c = i < links ? LINK_LIT : LINK_DIM;
      this.linkColors.setXYZ(i * 2, c.r, c.g, c.b);
      this.linkColors.setXYZ(i * 2 + 1, c.r, c.g, c.b);
    }
    this.linkColors.needsUpdate = true;
    return grew;
  }

  update(dtMs: number) {
    this.time += dtMs;
    // leve oscilacao de holograma
    (this.panel.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.1 * Math.sin(this.time * 0.004);
    if (this.pulses.size) {
      for (const [i, t] of this.pulses) {
        if (t + dtMs >= PULSE_MS) this.pulses.delete(i);
        else this.pulses.set(i, t + dtMs);
      }
    }
    this.syncInstances();
  }

  private syncInstances() {
    const d = this.dummy;
    for (let i = 0; i < MAP_NODES.length; i++) {
      const p = this.local(i);
      const t = this.pulses.get(i);
      const lit = i < this.litNodes;
      const breathe = lit ? 1 + 0.12 * Math.sin(this.time * 0.005 + i) : 0.8;
      const pop = t !== undefined ? 1 + 1.4 * (1 - t / PULSE_MS) : 1;
      d.position.set(p.x, p.y, 0.004);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(breathe * pop);
      d.updateMatrix();
      this.nodes.setMatrixAt(i, d.matrix);

      d.scale.setScalar(t !== undefined ? 1 + 5 * (t / PULSE_MS) : 0.0001);
      d.updateMatrix();
      this.rings.setMatrixAt(i, d.matrix);
      this.ringColor.copy(LIT).multiplyScalar(t !== undefined ? 1 - t / PULSE_MS : 0);
      this.rings.setColorAt(i, this.ringColor);
    }
    this.nodes.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    this.rings.instanceColor!.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.panel.geometry.dispose();
    (this.panel.material as THREE.Material).dispose();
    this.links.geometry.dispose();
    (this.links.material as THREE.Material).dispose();
    (this.nodes.material as THREE.Material).dispose();
    this.ringMat.dispose();
    this.nodes.dispose();
    this.rings.dispose();
  }
}
