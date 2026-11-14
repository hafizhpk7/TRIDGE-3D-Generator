import {
  Color,
  Matrix4,
  Mesh,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { Rgb, SourceData, SourceMesh, SourceTexture } from './types';

/** Source arrays for the worker, plus references the main thread needs to rebuild materials. */
export interface ExtractedSource {
  data: SourceData;
  /** Original material for each entry in data.meshes. */
  materials: Material[];
  hasTexture: boolean;
}

const MAX_TEXTURE_SIDE = 1024;

function srgbOf(color: Color): Rgb {
  const c = new Color().copy(color);
  const o = { r: 0, g: 0, b: 0 };
  c.getRGB(o, SRGBColorSpace);
  return [o.r, o.g, o.b];
}

function readTexture(tex: Texture): SourceTexture | null {
  const image = tex.image as
    (CanvasImageSource & { width?: number; height?: number; videoWidth?: number }) | undefined;
  if (!image) return null;
  const w = (image as { width?: number }).width ?? 0;
  const h = (image as { height?: number }).height ?? 0;
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_TEXTURE_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, cw, ch);
    return { width: cw, height: ch, data: ctx.getImageData(0, 0, cw, ch).data, flipY: tex.flipY };
  } catch {
    return null;
  }
}

function geometryRanges(
  geometry: BufferGeometry,
  material: Material | Material[],
  indexCount: number,
): { start: number; count: number; material: Material }[] {
  if (Array.isArray(material)) {
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: indexCount, materialIndex: 0 }];
    return groups.map((g) => ({
      start: g.start,
      count: Math.min(g.count, indexCount - g.start),
      material: material[g.materialIndex ?? 0] ?? material[0],
    }));
  }
  return [{ start: 0, count: indexCount, material }];
}

/**
 * Collect every mesh under `root` into plain arrays, in the root's own coordinate space.
 * Meshes with several materials are split so each part keeps its own look.
 */
export function extractSource(root: Object3D): ExtractedSource {
  root.updateWorldMatrix(true, true);
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  const textures: SourceTexture[] = [];
  const textureIds = new Map<Texture, number>();
  const meshes: SourceMesh[] = [];
  const materials: Material[] = [];
  const v = new Vector3();

  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const geometry = obj.geometry;
    const pos = geometry.getAttribute('position');
    if (!pos) return;

    const matrix = new Matrix4().multiplyMatrices(inverseRoot, obj.matrixWorld);
    const positions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      positions.set([v.x, v.y, v.z], i * 3);
    }

    const uvAttr = geometry.getAttribute('uv');
    const uvs = uvAttr ? new Float32Array(uvAttr.count * 2) : null;
    if (uvs && uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) uvs.set([uvAttr.getX(i), uvAttr.getY(i)], i * 2);
    }

    const colAttr = geometry.getAttribute('color');
    let vertexColors: Float32Array | null = null;
    if (colAttr) {
      vertexColors = new Float32Array(colAttr.count * 3);
      const tmp = new Color();
      for (let i = 0; i < colAttr.count; i++) {
        // glTF vertex colors are linear; convert to sRGB like everything else here.
        tmp.setRGB(colAttr.getX(i), colAttr.getY(i), colAttr.getZ(i));
        const [r, g, b] = srgbOf(tmp);
        vertexColors.set([r, g, b], i * 3);
      }
    }

    const index = geometry.getIndex();
    const indexCount = index ? index.count : pos.count;
    for (const range of geometryRanges(geometry, obj.material, indexCount)) {
      if (range.count < 3) continue;
      const indices = new Uint32Array(range.count);
      for (let i = 0; i < range.count; i++) {
        indices[i] = index ? index.getX(range.start + i) : range.start + i;
      }

      const mat = range.material as Material & { color?: Color; map?: Texture | null };
      let textureId = -1;
      if (mat.map && uvs) {
        let id = textureIds.get(mat.map);
        if (id === undefined) {
          const t = readTexture(mat.map);
          if (t) {
            id = textures.length;
            textures.push(t);
            textureIds.set(mat.map, id);
          }
        }
        textureId = id ?? -1;
      }

      meshes.push({
        // Each part owns its arrays so they can be transferred independently.
        positions: positions.slice(),
        indices,
        uvs: uvs ? uvs.slice() : null,
        vertexColors: vertexColors ? vertexColors.slice() : null,
        baseColor: mat.color ? srgbOf(mat.color) : [1, 1, 1],
        textureId,
      });
      materials.push(range.material);
    }
  });

  return { data: { meshes, textures }, materials, hasTexture: textures.length > 0 };
}
