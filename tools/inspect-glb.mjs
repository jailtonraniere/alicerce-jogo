// Mostra o conteudo de arquivos GLB: animacoes, malhas, materiais, ossos e altura.
// Uso: node tools/inspect-glb.mjs arquivo1.glb [arquivo2.glb ...]
import { NodeIO } from "@gltf-transform/core";

const io = new NodeIO();

for (const path of process.argv.slice(2)) {
  const doc = await io.read(path);
  const root = doc.getRoot();
  console.log(`\n=== ${path}`);

  console.log("animacoes:", root.listAnimations().map((a) => {
    const t = Math.max(...a.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0));
    return `${a.getName()}(${t.toFixed(2)}s)`;
  }).join(", "));

  let tris = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      minY = Math.min(minY, pos.getMin([])[1]);
      maxY = Math.max(maxY, pos.getMax([])[1]);
    }
  }
  console.log("malhas:", root.listMeshes().map((m) => m.getName()).join(", "));
  console.log("triangulos:", Math.round(tris), "| altura local da malha:", minY.toFixed(3), "a", maxY.toFixed(3));
  console.log("materiais:", root.listMaterials().map((m) => {
    const c = m.getBaseColorFactor().slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
    return `${m.getName()}#${c}${m.getBaseColorTexture() ? "+tex" : ""}`;
  }).join(", "));
  console.log("texturas:", root.listTextures().length, "| skins:", root.listSkins().length,
    "| ossos:", root.listSkins()[0]?.listJoints().length ?? 0);
  console.log("nos raiz:", root.listScenes()[0]?.listChildren().map((n) => {
    const s = n.getScale();
    const r = n.getRotation();
    return `${n.getName()} scale=[${s.map((v) => v.toFixed(3))}] rot=[${r.map((v) => v.toFixed(3))}]`;
  }).join(" | "));
}
