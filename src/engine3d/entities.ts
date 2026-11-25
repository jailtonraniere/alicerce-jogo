import * as THREE from "three";
import type { EntityKind } from "../sim/RunnerSim";
import type { Assets } from "./assets";

// Itens e obstaculos modelados em codigo (sem arquivos externos).
// Ciano = coletar. Ambar = desviar (padrao da marca para alerta).

type EntityData = {
  kind: EntityKind;
  age: number;
  baseY: number;
  spin: number;
  core?: THREE.Object3D;
  ghost?: THREE.Object3D;
  glitchT?: number;
};

export function entityData(obj: THREE.Object3D) {
  return obj.userData as EntityData;
}

export function buildEntity(kind: EntityKind, assets: Assets): THREE.Object3D {
  const { geo, mat } = assets;
  const grp = new THREE.Group();
  const data: EntityData = { kind, age: 0, baseY: 0, spin: 0 };

  switch (kind) {
    case "data": {
      // dado: cubo de vidro com nucleo aceso
      const shell = new THREE.Mesh(geo.dataShell, mat.dataShell);
      const edges = new THREE.LineSegments(geo.dataEdges, mat.dataEdges);
      const core = new THREE.Mesh(geo.dataCore, mat.dataCore);
      grp.add(core, shell, edges);
      grp.rotation.x = 0.35;
      data.baseY = 0.95;
      data.spin = 1.6;
      data.core = core;
      break;
    }
    case "indicator": {
      // indicador: mini grafico de barras em holograma
      const chart = new THREE.Mesh(geo.indicator, mat.indicator);
      chart.scale.setScalar(1.3);
      grp.add(chart);
      data.baseY = 1.05;
      data.spin = 1.9;
      break;
    }
    case "low": {
      // planilha solta: pilha de folhas com grade de celulas (pular)
      grp.add(new THREE.Mesh(geo.sheets, mat.sheets));
      data.baseY = 0;
      break;
    }
    case "high": {
      // dado desatualizado: barreira com faixa de alerta e falha digital (abaixar)
      const posts = new THREE.Mesh(geo.barrierPosts, mat.metal);
      const bar = new THREE.Mesh(geo.barrierBar, mat.barrier);
      bar.position.y = 1.55;
      const barEdges = new THREE.LineSegments(geo.barrierEdges, mat.blockEdges);
      barEdges.position.y = 1.55;
      grp.add(barEdges);
      const ghost = new THREE.Mesh(geo.barrierBar, mat.glitch);
      ghost.position.y = 1.55;
      ghost.scale.set(1.02, 1.1, 1.3);
      grp.add(posts, bar, ghost);
      data.ghost = ghost;
      data.glitchT = Math.random() * 600;
      break;
    }
    case "block": {
      // recurso parado: bloco com simbolo de pausa (trocar de pista)
      grp.add(new THREE.Mesh(geo.block, mat.block), new THREE.LineSegments(geo.blockEdges, mat.blockEdges));
      data.baseY = 0.95;
      break;
    }
    case "shield":
    case "magnet":
    case "turbo": {
      // power-up: anel hexagonal com icone de linha
      const ring = new THREE.Mesh(geo.hexRing, mat.hexRing);
      const icon = new THREE.Sprite(assets.icon(kind));
      icon.scale.setScalar(0.72);
      grp.add(ring, icon);
      data.baseY = 1.1;
      data.spin = 2.2;
      data.core = ring;
      break;
    }
  }

  grp.position.y = data.baseY;
  grp.userData = data;
  return grp;
}

export function animateEntity(obj: THREE.Object3D, dtMs: number, time: number, reducedMotion: boolean) {
  const d = entityData(obj);
  const dt = dtMs / 1000;
  if (d.kind === "data" || d.kind === "indicator") {
    obj.rotation.y += d.spin * dt;
    obj.position.y = d.baseY + Math.sin(time * 0.004 + obj.id) * 0.08;
    if (d.core) d.core.rotation.x -= 2.4 * dt;
  } else if (d.kind === "shield" || d.kind === "magnet" || d.kind === "turbo") {
    d.core!.rotation.y += d.spin * dt;
    obj.position.y = d.baseY + Math.sin(time * 0.005 + obj.id) * 0.1;
  } else if (d.kind === "high" && d.ghost) {
    // falha digital: o "fantasma" da barra salta de lado em rajadas curtas
    d.glitchT = (d.glitchT ?? 0) + dtMs;
    const phase = d.glitchT % 900;
    const glitching = !reducedMotion && phase > 700;
    d.ghost.visible = glitching || Math.sin(time * 0.02) > 0.6;
    d.ghost.position.x = glitching ? (Math.random() - 0.5) * 0.5 : 0;
  }
}
