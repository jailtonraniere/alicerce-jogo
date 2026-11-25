import Phaser from "phaser";
import { HEX } from "../theme";
import { MAP_NODES as NODES, MAP_LINKS as LINKS, type MapNode as Node } from "./stateMapData";

// Rede de nos que representa o mapa do estado conectando ao fundo.
// Os nos acendem (ciano) conforme o numero de municipios conectados cresce.

export class StateMap {
  private g: Phaser.GameObjects.Graphics;
  private w: number;
  private h: number;
  private x0: number;
  private y0: number;

  constructor(scene: Phaser.Scene, x0: number, y0: number, w: number, h: number) {
    this.g = scene.add.graphics();
    this.g.setDepth(-5);
    this.x0 = x0;
    this.y0 = y0;
    this.w = w;
    this.h = h;
    this.draw(0);
  }

  private px(n: Node) {
    return { x: this.x0 + n.x * this.w, y: this.y0 + n.y * this.h };
  }

  // ratio de 0 a 1 = fracao do mapa conectada
  draw(ratio: number) {
    const g = this.g;
    g.clear();
    const lit = Math.round(ratio * NODES.length);

    g.lineStyle(1, HEX.mapNode, 0.45);
    LINKS.forEach(([a, b], i) => {
      const litLink = i < Math.round(ratio * LINKS.length);
      g.lineStyle(litLink ? 1.4 : 1, litLink ? HEX.accent : HEX.mapNode, litLink ? 0.7 : 0.35);
      const pa = this.px(NODES[a]);
      const pb = this.px(NODES[b]);
      g.beginPath();
      g.moveTo(pa.x, pa.y);
      g.lineTo(pb.x, pb.y);
      g.strokePath();
    });

    NODES.forEach((n, i) => {
      const p = this.px(n);
      const on = i < lit;
      g.fillStyle(on ? HEX.accent : HEX.mapNode, on ? 0.95 : 0.5);
      g.fillCircle(p.x, p.y, on ? 4 : 3);
    });
  }

  destroy() {
    this.g.destroy();
  }
}
