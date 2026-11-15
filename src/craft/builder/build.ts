import { Color } from 'three';
import { FALLBACK_COLOR, type Part, type ShapeSpec } from '../spec/types';
import { expandSpec, type ExpandedBone } from './expand';
import { buildPartMesh } from './geometry';

export interface BuildOptions {
  /** 1 (chunky) to 10 (smooth). */
  detail: number;
  /** Blend vertices near limb joints with the parent bone to hide cracks. Default on. */
  softJoints?: boolean;
}

export interface PartRange {
  /** Id after mirroring, such as "ear_r". */
  id: string;
  /** First vertex of the part inside the merged arrays. */
  start: number;
  /** Number of vertices. */
  count: number;
}

/** Everything needed to make a SkinnedMesh, in plain arrays so it can cross a worker boundary. */
export interface BuiltCraft {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB per vertex. */
  colors: Float32Array;
  /** Four bone indices per vertex. */
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  bones: ExpandedBone[];
  ranges: PartRange[];
  triangles: number;
  partCount: number;
  warnings: string[];
}

const LIMB = /^(leg|arm|wing|fin|foot|hand)_/;
const JOINT_RADIUS = 0.15;

function colorOf(part: Part, palette: Record<string, string>): Color {
  const hex = palette[part.color] ?? (part.color.startsWith('#') ? part.color : FALLBACK_COLOR);
  return new Color(hex);
}

/** Flat normals for unrolled triangles. */
function flatNormals(positions: Float32Array): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const e1x = positions[i + 3] - positions[i];
    const e1y = positions[i + 4] - positions[i + 1];
    const e1z = positions[i + 5] - positions[i + 2];
    const e2x = positions[i + 6] - positions[i];
    const e2y = positions[i + 7] - positions[i + 1];
    const e2z = positions[i + 8] - positions[i + 2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k++) out.set([nx, ny, nz], i + k * 3);
  }
  return out;
}

/**
 * Shape Spec to arrays: mirror, chain bones, geometry per part, flat color, rigid skin weights.
 * Pure data in, pure data out, so it runs the same in a worker or in tests.
 */
export function buildCraft(spec: ShapeSpec, options: BuildOptions): BuiltCraft {
  const { detail, softJoints = true } = options;
  const expanded = expandSpec(spec);
  const warnings = [...expanded.warnings];
  const boneIndex = new Map(expanded.bones.map((b, i) => [b.name, i]));
  const boneByName = new Map(expanded.bones.map((b) => [b.name, b]));

  const posChunks: Float32Array[] = [];
  const colChunks: Float32Array[] = [];
  const idxChunks: Uint16Array[] = [];
  const wChunks: Float32Array[] = [];
  const ranges: PartRange[] = [];
  let vertexTotal = 0;

  for (const part of expanded.parts) {
    const mesh = buildPartMesh(part, detail);
    const count = mesh.positions.length / 3;
    if (count === 0) continue;

    const color = colorOf(part, spec.palette);
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) colors.set([color.r, color.g, color.b], v * 3);

    const skinIdx = new Uint16Array(count * 4);
    const skinW = new Float32Array(count * 4);

    const chain = expanded.chains.get(part.id);
    const ownBone = boneIndex.get(part.bone);
    if (ownBone === undefined)
      warnings.push(`Part "${part.id}" uses bone "${part.bone}", which does not exist.`);
    const rigid = ownBone ?? 0;

    if (chain && mesh.curveT) {
      // Smooth skinning along a bone chain: blend the two nearest chain bones by curve position.
      const n = chain.bones.length;
      const idx = chain.bones.map((name) => boneIndex.get(name) ?? rigid);
      for (let v = 0; v < count; v++) {
        const u = Math.min(n, Math.max(0, mesh.curveT[v] * n));
        let k = Math.floor(u);
        let f = u - k;
        if (k >= n) {
          k = n - 1;
          f = 1;
        }
        if (k + 1 < n) {
          skinIdx[v * 4] = idx[k];
          skinIdx[v * 4 + 1] = idx[k + 1];
          skinW[v * 4] = 1 - f;
          skinW[v * 4 + 1] = f;
        } else {
          skinIdx[v * 4] = idx[k];
          skinW[v * 4] = 1;
        }
      }
    } else {
      for (let v = 0; v < count; v++) {
        skinIdx[v * 4] = rigid;
        skinW[v * 4] = 1;
      }
      // Soft joints: near the bone's head, share the vertex with the parent bone.
      const bone = boneByName.get(part.bone);
      const parent = bone?.parent ? boneIndex.get(bone.parent) : undefined;
      if (softJoints && bone && parent !== undefined && LIMB.test(bone.name)) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let v = 0; v < count; v++) {
          for (let a = 0; a < 3; a++) {
            const value = mesh.positions[v * 3 + a];
            if (value < min[a]) min[a] = value;
            if (value > max[a]) max[a] = value;
          }
        }
        const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        const r = JOINT_RADIUS * size;
        const [hx, hy, hz] = bone.head;
        for (let v = 0; v < count; v++) {
          const d = Math.hypot(
            mesh.positions[v * 3] - hx,
            mesh.positions[v * 3 + 1] - hy,
            mesh.positions[v * 3 + 2] - hz,
          );
          if (d < r) {
            skinIdx[v * 4 + 1] = parent;
            skinW[v * 4] = 0.5;
            skinW[v * 4 + 1] = 0.5;
          }
        }
      }
    }

    posChunks.push(mesh.positions);
    colChunks.push(colors);
    idxChunks.push(skinIdx);
    wChunks.push(skinW);
    ranges.push({ id: part.id, start: vertexTotal, count });
    vertexTotal += count;
  }

  const concat = <T extends Float32Array | Uint16Array>(
    chunks: T[],
    Ctor: new (n: number) => T,
    perVertex: number,
  ): T => {
    const out = new Ctor(vertexTotal * perVertex);
    let o = 0;
    for (const c of chunks) {
      out.set(c as never, o);
      o += c.length;
    }
    return out;
  };

  const positions = concat(posChunks, Float32Array, 3);
  return {
    positions,
    normals: flatNormals(positions),
    colors: concat(colChunks, Float32Array, 3),
    skinIndices: concat(idxChunks, Uint16Array, 4),
    skinWeights: concat(wChunks, Float32Array, 4),
    bones: expanded.bones,
    ranges,
    triangles: vertexTotal / 3,
    partCount: ranges.length,
    warnings,
  };
}

/** Which part owns triangle `faceIndex`, given the merged ranges. */
export function partAtFace(ranges: PartRange[], faceIndex: number): string | null {
  const vertex = faceIndex * 3;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (vertex < r.start) hi = mid - 1;
    else if (vertex >= r.start + r.count) lo = mid + 1;
    else return r.id;
  }
  return null;
}
