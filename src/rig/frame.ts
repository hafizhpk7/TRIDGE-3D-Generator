export type Vec3 = [number, number, number];

/** Which way the model faces. The Craft convention is +z with the model's left on +x. */
export type Facing = '+z' | '-z' | '+x' | '-x';
export const FACINGS: { id: Facing; label: string }[] = [
  { id: '+z', label: 'Toward +Z' },
  { id: '-z', label: 'Toward -Z' },
  { id: '+x', label: 'Toward +X' },
  { id: '-x', label: 'Toward -X' },
];

const FRONT: Record<Facing, Vec3> = {
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
};

/** A model-aligned frame: u points to the front, v up, w to the model's left. */
export interface Frame {
  facing: Facing;
  front: Vec3;
  left: Vec3;
  /** Extents of the geometry along each frame axis. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  w0: number;
  w1: number;
}

export const leftOf = (front: Vec3): Vec3 => [front[2], 0, -front[0]];

/** Measure a point cloud (flat xyz array) in the frame for a facing. */
export function makeFrame(positions: ArrayLike<number>, facing: Facing, maxSamples = 60000): Frame {
  const front = FRONT[facing];
  const left = leftOf(front);
  const n = Math.floor(positions.length / 3);
  const step = Math.max(1, Math.floor(n / maxSamples));
  let u0 = Infinity,
    u1 = -Infinity,
    v0 = Infinity,
    v1 = -Infinity,
    w0 = Infinity,
    w1 = -Infinity;
  for (let i = 0; i < n; i += step) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const u = x * front[0] + z * front[2];
    const w = x * left[0] + z * left[2];
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (y < v0) v0 = y;
    if (y > v1) v1 = y;
    if (w < w0) w0 = w;
    if (w > w1) w1 = w;
  }
  if (!Number.isFinite(u0)) {
    u0 = u1 = v0 = v1 = w0 = w1 = 0;
  }
  return { facing, front, left, u0, u1, v0, v1, w0, w1 };
}

/** Frame coordinates (u, v, w) to model space. */
export function toModel(f: Frame, u: number, v: number, w: number): Vec3 {
  return [f.front[0] * u + f.left[0] * w, v, f.front[2] * u + f.left[2] * w];
}

/** Model space to frame coordinates. */
export function toFrame(f: Frame, p: Vec3): { u: number; v: number; w: number } {
  return {
    u: p[0] * f.front[0] + p[2] * f.front[2],
    v: p[1],
    w: p[0] * f.left[0] + p[2] * f.left[2],
  };
}

/** Reflect a point across the model's left-right plane (the plane w = wc). */
export function mirrorPoint(f: Frame, p: Vec3): Vec3 {
  const { u, v, w } = toFrame(f, p);
  const wc = (f.w0 + f.w1) / 2;
  return toModel(f, u, v, 2 * wc - w);
}

/** Swap the side suffix of a bone name: leg_l becomes leg_r and back. Null for centered bones. */
export function twinName(name: string): string | null {
  if (name.endsWith('_l')) return `${name.slice(0, -2)}_r`;
  if (name.endsWith('_r')) return `${name.slice(0, -2)}_l`;
  return null;
}

export function sideOf(name: string): 'l' | 'r' | null {
  if (name.endsWith('_l')) return 'l';
  if (name.endsWith('_r')) return 'r';
  return null;
}
