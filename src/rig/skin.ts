import { sideOf, toFrame, toModel, type Frame, type Vec3 } from './frame';
import { childrenOf, type JointDef, type RigBodyType } from './skeleton';

/** A bone as a set of line segments (head to each child, or head to an estimated tip). */
export interface SkinBone {
  name: string;
  segments: [Vec3, Vec3][];
  side: 'l' | 'r' | null;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/**
 * Where a leaf bone ends. Joints are single points, so leaves need a direction:
 * legs go down to the ground, arms/wings/fins go out to the side, heads go forward (animals) or up (people).
 */
export function boneTip(
  name: string,
  head: Vec3,
  parentHead: Vec3 | null,
  frame: Frame,
  bodyType: RigBodyType,
): Vec3 {
  const { u, v, w } = toFrame(frame, head);
  const H = frame.v1 - frame.v0;
  if (/^leg/.test(name)) return toModel(frame, u, frame.v0 + 0.02 * H, w);
  if (/^(arm|wing|fin_[lr])/.test(name)) {
    const side = sideOf(name);
    return toModel(frame, u, v, side === 'r' ? frame.w0 : frame.w1);
  }
  if (name === 'fin_top') return toModel(frame, u, frame.v1, w);
  if (name === 'head') {
    return bodyType === 'biped' || bodyType === 'object'
      ? toModel(frame, u, frame.v1, w)
      : toModel(frame, frame.u1, Math.min(frame.v1, v + 0.1 * H), w);
  }
  if (parentHead) {
    // Keep going the way the chain was going, half as far again.
    const d = sub(head, parentHead);
    return [head[0] + d[0] * 0.6, head[1] + d[1] * 0.6, head[2] + d[2] * 0.6];
  }
  return head;
}

/** Turn joint positions and a skeleton template into bones with segments. */
export function buildSkinBones(
  joints: Record<string, Vec3>,
  skeleton: JointDef[],
  frame: Frame,
  bodyType: RigBodyType,
): SkinBone[] {
  const kids = childrenOf(skeleton);
  const parentOf = new Map(skeleton.map((j) => [j.name, j.parent]));
  return skeleton.map((j) => {
    const head = joints[j.name];
    const children = (kids.get(j.name) ?? []).filter((c) => joints[c]);
    const segments: [Vec3, Vec3][] = children.map((c) => [head, joints[c]]);
    // Limbs, heads and fin/wing bones also reach out to their tip, even when they have children.
    const parent = parentOf.get(j.name);
    const leaf = children.length === 0;
    const forced = /^(leg|arm|wing|fin_|head)/.test(j.name);
    if (leaf || forced) {
      const tip = boneTip(j.name, head, parent ? joints[parent] : null, frame, bodyType);
      if (len(sub(tip, head)) > 1e-6) segments.push([head, tip]);
    }
    if (segments.length === 0) segments.push([head, head]);
    return { name: j.name, segments, side: sideOf(j.name) };
  });
}

function distToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (l2 > 1e-12) {
    t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / l2;
    t = Math.max(0, Math.min(1, t));
  }
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + aby * t), p[2] - (a[2] + abz * t));
}

export interface SkinInput {
  positions: Float32Array;
  /** Triangle indices, or null for an unindexed triangle list. */
  indices: Uint32Array | null;
  bones: SkinBone[];
  frame: Frame;
  /** How quickly influence fades away from the nearest bone, as a fraction of model height. */
  falloff?: number;
  smoothIterations?: number;
}

export interface SkinResult {
  /** Four bone indices per vertex. */
  skinIndices: Uint16Array;
  /** Four weights per vertex, summing to 1. */
  skinWeights: Float32Array;
}

const MAX_INFLUENCES = 4;

/** Group vertices that sit at the same position, so flat-shaded meshes get one weight per spot. */
function weld(positions: Float32Array): { groupOf: Int32Array; reps: number[] } {
  const n = positions.length / 3;
  const groupOf = new Int32Array(n);
  const reps: number[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(positions[i * 3] * 1e4)},${Math.round(positions[i * 3 + 1] * 1e4)},${Math.round(positions[i * 3 + 2] * 1e4)}`;
    let g = seen.get(key);
    if (g === undefined) {
      g = reps.length;
      reps.push(i);
      seen.set(key, g);
    }
    groupOf[i] = g;
  }
  return { groupOf, reps };
}

/**
 * Automatic skin weights: each vertex follows the bones nearest to it, with a smooth falloff,
 * left and right limbs kept apart, at most four influences, then smoothed over neighboring vertices.
 */
export function computeSkinWeights(input: SkinInput): SkinResult {
  const { positions, indices, bones, frame } = input;
  const n = positions.length / 3;
  const B = bones.length;
  const skinIndices = new Uint16Array(n * MAX_INFLUENCES);
  const skinWeights = new Float32Array(n * MAX_INFLUENCES);
  if (n === 0 || B === 0) return { skinIndices, skinWeights };

  // The root only anchors the model; it takes weight only when it is the one bone there is.
  const rootIndex = B === 1 ? -1 : bones.findIndex((b) => b.name === 'root');
  const H = Math.max(frame.v1 - frame.v0, 1e-6);
  const sigma = (input.falloff ?? 0.09) * Math.max(H, frame.u1 - frame.u0, frame.w1 - frame.w0);
  const W = frame.w1 - frame.w0;
  const wc = (frame.w0 + frame.w1) / 2;

  const { groupOf, reps } = weld(positions);
  const G = reps.length;

  // ---- raw weights per welded vertex
  let dense = new Float32Array(G * B);
  const dist = new Float64Array(B);
  for (let g = 0; g < G; g++) {
    const i = reps[g];
    const p: Vec3 = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    let minD = Infinity;
    for (let b = 0; b < B; b++) {
      if (b === rootIndex) {
        dist[b] = Infinity;
        continue;
      }
      let d = Infinity;
      for (const [a, c] of bones[b].segments) d = Math.min(d, distToSegment(p, a, c));
      dist[b] = d;
      if (d < minD) minD = d;
    }
    const side = toFrame(frame, p).w - wc;
    let sum = 0;
    for (let b = 0; b < B; b++) {
      if (b === rootIndex || !Number.isFinite(dist[b])) continue;
      let w = Math.exp(-(((dist[b] - minD) / sigma) ** 2));
      const bs = bones[b].side;
      // A vertex clearly on the left should not follow a right-hand limb, and the other way round.
      if (bs && Math.abs(side) > 0.08 * W && (bs === 'l') !== side > 0) w *= 0.05;
      dense[g * B + b] = w;
      sum += w;
    }
    if (sum > 0) for (let b = 0; b < B; b++) dense[g * B + b] /= sum;
  }

  // ---- smoothing over neighbors (edges of the welded mesh)
  const iterations = input.smoothIterations ?? 3;
  if (iterations > 0 && G > 1) {
    const neighbors: Set<number>[] = Array.from({ length: G }, () => new Set<number>());
    const triCount = indices ? indices.length / 3 : Math.floor(n / 3);
    for (let t = 0; t < triCount; t++) {
      const v = indices
        ? [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]]
        : [t * 3, t * 3 + 1, t * 3 + 2];
      const g = v.map((x) => groupOf[x]);
      for (let k = 0; k < 3; k++) {
        const a = g[k];
        const c = g[(k + 1) % 3];
        if (a !== c) {
          neighbors[a].add(c);
          neighbors[c].add(a);
        }
      }
    }
    for (let it = 0; it < iterations; it++) {
      const next = new Float32Array(dense.length);
      for (let g = 0; g < G; g++) {
        const nb = neighbors[g];
        for (let b = 0; b < B; b++) {
          let avg = dense[g * B + b];
          if (nb.size > 0) {
            let s = 0;
            for (const o of nb) s += dense[o * B + b];
            avg = 0.5 * dense[g * B + b] + 0.5 * (s / nb.size);
          }
          next[g * B + b] = avg;
        }
      }
      dense = next;
    }
  }

  // ---- keep the strongest four influences and normalize
  const groupIdx = new Uint16Array(G * MAX_INFLUENCES);
  const groupW = new Float32Array(G * MAX_INFLUENCES);
  const order = Array.from({ length: B }, (_, b) => b);
  for (let g = 0; g < G; g++) {
    order.sort((a, b) => dense[g * B + b] - dense[g * B + a]);
    let sum = 0;
    for (let k = 0; k < MAX_INFLUENCES; k++) {
      const b = k < B ? order[k] : 0;
      const w = k < B ? dense[g * B + b] : 0;
      groupIdx[g * 4 + k] = b;
      groupW[g * 4 + k] = w;
      sum += w;
    }
    if (sum <= 1e-9) {
      // Nothing claimed this vertex (for example a lone root): give it to the first bone.
      groupIdx[g * 4] = rootIndex >= 0 ? (rootIndex === 0 ? 1 % B : 0) : 0;
      groupW[g * 4] = 1;
      for (let k = 1; k < 4; k++) groupW[g * 4 + k] = 0;
    } else {
      for (let k = 0; k < 4; k++) groupW[g * 4 + k] /= sum;
    }
  }

  for (let i = 0; i < n; i++) {
    const g = groupOf[i];
    for (let k = 0; k < 4; k++) {
      skinIndices[i * 4 + k] = groupIdx[g * 4 + k];
      skinWeights[i * 4 + k] = groupW[g * 4 + k];
    }
  }
  return { skinIndices, skinWeights };
}
