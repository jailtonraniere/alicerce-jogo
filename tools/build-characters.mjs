// Prepara os personagens 3D para o jogo e grava GLB enxuto em public/models/:
//  - mantem so as animacoes usadas (e tira o prefixo dos nomes);
//  - remove UVs (os modelos nao tem textura) e compacta os pesos dos ossos;
//  - aplica as cores da marca nas roupas e grava as cores nos vertices;
//  - une as 4 partes (cabeca, corpo, pernas, pes) e todos os materiais numa
//    unica malha: 1 chamada de desenho por personagem, em vez de ~10.
// Fonte: assets-src/quaternius/ (Quaternius, Ultimate Modular Men/Women, CC0).
// Uso: node tools/build-characters.mjs
import { NodeIO } from "@gltf-transform/core";
import { mkdirSync, statSync } from "node:fs";

const SRC = "assets-src/quaternius";
const OUT = "public/models";

// personagem do jogo -> arquivo de origem
const CHARACTERS = {
  gestora: `${SRC}/women/Suit.glb`,
  secretaria: `${SRC}/women/Formal.glb`,
  analista: `${SRC}/men/Casual.glb`,
  tecnico: `${SRC}/women/Casual.glb`, // tecnica de referencia (assistente social ou psicologa)
  comercial: `${SRC}/men/BusinessMan.glb`,
};

// Roupas nas cores da marca (nome do material -> cor sRGB). Pele e cabelo ficam como estao.
// Tons claros o bastante para destacar do fundo marinho.
const PALETTES = {
  gestora: { Black: 0x2f6fae, White: 0xf2f7fb, Brown: 0x16314f },
  secretaria: { LimeGreen: 0x3aa7dc, Brown: 0x16314f }, // "Red" e o cabelo ruivo
  analista: { White: 0x5bc2f0, Red_Dark: 0x2a4f78, LightBlue: 0x16314f, LightBrown: 0x2a4f78 },
  // blusa azul bem claro, calca marinho; cabelo castanho escuro para nao confundir com a Gestora
  tecnico: { White: 0xcfe3f1, Orange: 0x2a4f78, Grey: 0x16314f, Hair_Blond: 0x3b2418 },
  // terno grafite azulado, gravata no ciano da marca
  comercial: { Suit: 0x3a4d63, Tie: 0x5bc2f0, White: 0xf2f7fb, Black: 0x16314f },
};

// animacoes usadas pelo jogo
const KEEP = new Set(["Run", "Idle", "Roll", "Death", "Wave"]);

const io = new NodeIO();
mkdirSync(OUT, { recursive: true });

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexToLinear(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => srgbToLinear(v / 255));
}

function quantizeWeights(src) {
  const out = new Uint8Array(src.length);
  for (let v = 0; v < src.length; v += 4) {
    const sum = src[v] + src[v + 1] + src[v + 2] + src[v + 3] || 1;
    const scaled = [0, 1, 2, 3].map((k) => (src[v + k] / sum) * 255);
    const q = scaled.map(Math.floor);
    let rest = 255 - q.reduce((a, b) => a + b, 0);
    // distribui o que sobrou para os maiores restos (soma fica exatamente 255)
    const order = [0, 1, 2, 3].sort((a, b) => scaled[b] - q[b] - (scaled[a] - q[a]));
    for (let i = 0; rest > 0; i = (i + 1) % 4, rest--) q[order[i]]++;
    out.set(q, v);
  }
  return out;
}

for (const [id, src] of Object.entries(CHARACTERS)) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const palette = PALETTES[id] ?? {};

  // 1) animacoes
  for (const anim of root.listAnimations()) {
    const name = anim.getName().replace(/^.*\|/, "");
    if (KEEP.has(name)) {
      anim.setName(name);
      continue;
    }
    anim.listChannels().forEach((c) => c.dispose());
    anim.listSamplers().forEach((s) => s.dispose());
    anim.dispose();
  }

  // 2) une todas as partes numa malha so, com a cor de cada material nos vertices
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  const skin = meshNodes[0].getSkin();
  const pos = [];
  const nor = [];
  const joints = [];
  const weights = [];
  const color = [];
  const indices = [];
  let base = 0;
  for (const node of meshNodes) {
    if (node.getSkin() !== skin) {
      // seguranca: so une partes que usam o mesmo esqueleto
      const a = node.getSkin().listJoints().map((j) => j.getName()).join();
      const b = skin.listJoints().map((j) => j.getName()).join();
      if (a !== b) throw new Error(`${id}: esqueletos diferentes, nao da para unir`);
    }
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute("POSITION").getArray();
      const N = prim.getAttribute("NORMAL").getArray();
      const J = prim.getAttribute("JOINTS_0").getArray();
      const W = prim.getAttribute("WEIGHTS_0");
      const Wq = W.getComponentType() === 5126 ? quantizeWeights(W.getArray()) : W.getArray();
      const mat = prim.getMaterial();
      const rgb = palette[mat?.getName()] !== undefined
        ? hexToLinear(palette[mat.getName()])
        : (mat?.getBaseColorFactor() ?? [1, 1, 1, 1]).slice(0, 3);
      const count = P.length / 3;
      pos.push(P);
      nor.push(N);
      joints.push(J);
      weights.push(Wq);
      // cor linear em 8 bits (cores chapadas: precisao de sobra), alfa 255
      const rgba = [...rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)), 255];
      const C = new Uint8Array(count * 4);
      for (let i = 0; i < count; i++) C.set(rgba, i * 4);
      color.push(C);
      const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: count }, (_, i) => i);
      indices.push(Uint32Array.from(idx, (v) => v + base));
      base += count;
    }
  }

  const concat = (parts, Type) => {
    const out = new Type(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };
  const acc = (type, array, normalized = false) =>
    doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);

  const material = doc.createMaterial("Personagem").setMetallicFactor(0).setRoughnessFactor(0.7);
  const indexArray = base < 65536 ? Uint16Array.from(concat(indices, Uint32Array)) : concat(indices, Uint32Array);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", acc("VEC3", concat(pos, Float32Array)))
    .setAttribute("NORMAL", acc("VEC3", concat(nor, Float32Array)))
    .setAttribute("JOINTS_0", acc("VEC4", concat(joints, Uint16Array)))
    .setAttribute("WEIGHTS_0", acc("VEC4", concat(weights, Uint8Array), true))
    .setAttribute("COLOR_0", acc("VEC4", concat(color, Uint8Array), true))
    .setIndices(acc("SCALAR", indexArray))
    .setMaterial(material);
  const merged = doc.createMesh(`${id}_unico`).addPrimitive(prim);

  // o primeiro no recebe a malha unida; os outros saem
  const keep = meshNodes[0];
  const oldMeshes = meshNodes.map((n) => n.getMesh());
  keep.setMesh(merged).setSkin(skin).setName(id);
  for (const n of meshNodes.slice(1)) n.dispose();
  for (const m of oldMeshes) {
    m.listPrimitives().forEach((p) => p.dispose());
    m.dispose();
  }
  for (const s of root.listSkins()) if (s !== skin) s.dispose();
  for (const m of root.listMaterials()) if (m !== material) m.dispose();

  // 3) descarta dados que ficaram sem uso
  for (const a of root.listAccessors()) {
    if (a.listParents().every((p) => p === root)) a.dispose();
  }

  const out = `${OUT}/${id}.glb`;
  await io.write(out, doc);
  const kept = root.listAnimations().map((a) => a.getName()).join(", ");
  console.log(
    `${id.padEnd(11)} ${(statSync(src).size / 1024).toFixed(0).padStart(5)} KB -> ${(statSync(out).size / 1024)
      .toFixed(0)
      .padStart(4)} KB  malhas=${root.listMeshes().length} prims=${root.listMeshes()[0].listPrimitives().length} vertices=${base}  [${kept}]`
  );
}
