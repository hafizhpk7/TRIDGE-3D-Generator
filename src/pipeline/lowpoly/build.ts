import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { ExtractedSource } from './source';
import type { ColorMode, LowPolyResult, ResultMesh, Rgb } from './types';

/** Face colors (sRGB) to a per-corner linear color attribute. */
function colorAttribute(faceColors: Float32Array): BufferAttribute {
  const faces = faceColors.length / 3;
  const out = new Float32Array(faces * 9);
  const c = new Color();
  for (let f = 0; f < faces; f++) {
    c.setRGB(faceColors[f * 3], faceColors[f * 3 + 1], faceColors[f * 3 + 2], SRGBColorSpace);
    for (let k = 0; k < 3; k++) out.set([c.r, c.g, c.b], f * 9 + k * 3);
  }
  return new BufferAttribute(out, 3);
}

function geometryFor(mesh: ResultMesh, withColors: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  if (mesh.uvs) g.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
  if (withColors) g.setAttribute('color', colorAttribute(mesh.faceColors));
  g.computeBoundingSphere();
  return g;
}

/** Turn a worker result into three.js objects. Materials for "texture" mode are clones of the originals. */
export function buildProcessed(
  source: ExtractedSource,
  result: LowPolyResult,
  mode: ColorMode,
): Group {
  const group = new Group();
  group.name = 'LowPoly';
  const shared =
    mode === 'texture'
      ? null
      : new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });

  result.meshes.forEach((m, i) => {
    let material: Material;
    if (shared) material = shared;
    else material = source.materials[i].clone();
    // Texture mode keeps the original material, which may still rely on vertex colors.
    const needsColors =
      mode !== 'texture' || (material as { vertexColors?: boolean }).vertexColors === true;
    const mesh = new Mesh(geometryFor(m, needsColors), material);
    mesh.name = `LowPoly${i}`;
    group.add(mesh);
  });
  return group;
}

/** Re-color palette-mode meshes after the user edits a swatch. No worker needed. */
export function applyPalette(group: Group, result: LowPolyResult, palette: Rgb[]) {
  group.children.forEach((child, i) => {
    const m = result.meshes[i];
    if (!(child instanceof Mesh) || !m?.paletteIndex) return;
    const faces = m.paletteIndex.length;
    for (let f = 0; f < faces; f++) {
      const c = palette[m.paletteIndex[f]] ?? [0, 0, 0];
      m.faceColors[f * 3] = c[0];
      m.faceColors[f * 3 + 1] = c[1];
      m.faceColors[f * 3 + 2] = c[2];
    }
    const old = child.geometry.getAttribute('color');
    const fresh = colorAttribute(m.faceColors);
    if (old && old.array.length === fresh.array.length) {
      (old.array as Float32Array).set(fresh.array as Float32Array);
      old.needsUpdate = true;
    } else {
      child.geometry.setAttribute('color', fresh);
    }
  });
}
