import { compact } from '../lowpoly/simplify';

export interface ReliefInput {
  /** 8-bit depth, brighter = closer. */
  depth: Uint8ClampedArray | Uint8Array;
  depthWidth: number;
  depthHeight: number;
  /** RGBA picture (the cutout). Its alpha decides which parts become part of the relief. */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** Grid cells along each side. */
  grid: number;
  /** Relief height, as a fraction of the picture width. */
  reliefDepth: number;
}

export interface ReliefMesh {
  positions: Float32Array;
  /** sRGB 0..1 per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
}

const ALPHA_CUT = 24;
/** The thinnest part of the relief, so it never collapses to a sheet. */
const BASE_THICKNESS = 0.03;
const BACK_SHADE = 0.7;

function sample(
  data: ArrayLike<number>,
  w: number,
  h: number,
  channels: number,
  channel: number,
  u: number,
  v: number,
): number {
  const x = Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))));
  const y = Math.min(h - 1, Math.max(0, Math.round(v * (h - 1))));
  return data[(y * w + x) * channels + channel];
}

/**
 * Build a closed relief solid from a depth map and a cutout: a displaced front surface,
 * a flat back, and side walls where the cutout ends. Background cells are left out.
 * One unit is the picture width; +z points toward the viewer.
 */
export function buildReliefMesh(input: ReliefInput): ReliefMesh {
  const { grid: G, reliefDepth } = input;
  const n = G + 1;
  const vertexCount = n * n;

  // Which grid corners lie inside the cutout?
  const inside = new Uint8Array(vertexCount);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = sample(input.rgba, input.width, input.height, 4, 3, i / G, j / G);
      inside[j * n + i] = a > ALPHA_CUT ? 1 : 0;
    }
  }
  const cellIn = (i: number, j: number) =>
    i >= 0 &&
    j >= 0 &&
    i < G &&
    j < G &&
    inside[j * n + i] &&
    inside[j * n + i + 1] &&
    inside[(j + 1) * n + i] &&
    inside[(j + 1) * n + i + 1];

  // Depth at each corner, lightly blurred to calm the model's noise.
  const raw = new Float32Array(vertexCount);
  const blur = 1 / G;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = i / G;
      const v = j / G;
      let sum = 0;
      for (const [du, dv] of [
        [0, 0],
        [blur, 0],
        [-blur, 0],
        [0, blur],
        [0, -blur],
      ]) {
        sum += sample(input.depth, input.depthWidth, input.depthHeight, 1, 0, u + du, v + dv);
      }
      raw[j * n + i] = sum / 5;
    }
  }

  // Stretch depth to the range actually used by the object (ignoring extreme 2% on each end).
  const used: number[] = [];
  for (let k = 0; k < vertexCount; k++) if (inside[k]) used.push(raw[k]);
  used.sort((a, b) => a - b);
  const lo = used.length ? used[Math.floor(used.length * 0.02)] : 0;
  const hi = used.length ? used[Math.min(used.length - 1, Math.floor(used.length * 0.98))] : 255;
  const span = Math.max(1, hi - lo);

  const positions = new Float32Array(vertexCount * 2 * 3);
  const colors = new Float32Array(vertexCount * 2 * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const t = Math.min(1, Math.max(0, (raw[k] - lo) / span));
      const x = i / G - 0.5;
      const y = 0.5 - j / G;
      positions.set([x, y, BASE_THICKNESS + t * reliefDepth], k * 3);
      positions.set([x, y, 0], (vertexCount + k) * 3);
      const r = sample(input.rgba, input.width, input.height, 4, 0, i / G, j / G) / 255;
      const g = sample(input.rgba, input.width, input.height, 4, 1, i / G, j / G) / 255;
      const b = sample(input.rgba, input.width, input.height, 4, 2, i / G, j / G) / 255;
      colors.set([r, g, b], k * 3);
      colors.set([r * BACK_SHADE, g * BACK_SHADE, b * BACK_SHADE], (vertexCount + k) * 3);
    }
  }

  const tris: number[] = [];
  const front = (k: number) => k;
  const back = (k: number) => vertexCount + k;

  /** Add a triangle, flipping it if it faces against `outward`. */
  const push = (a: number, b: number, c: number, outward: [number, number, number]) => {
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const e1 = [positions[b * 3] - ax, positions[b * 3 + 1] - ay, positions[b * 3 + 2] - az];
    const e2 = [positions[c * 3] - ax, positions[c * 3 + 1] - ay, positions[c * 3 + 2] - az];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (nx * outward[0] + ny * outward[1] + nz * outward[2] >= 0) tris.push(a, b, c);
    else tris.push(a, c, b);
  };

  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      if (!cellIn(i, j)) continue;
      const a = j * n + i; // top-left
      const b = a + 1; // top-right
      const c = a + n; // bottom-left
      const d = c + 1; // bottom-right

      push(front(a), front(c), front(d), [0, 0, 1]);
      push(front(a), front(d), front(b), [0, 0, 1]);
      push(back(a), back(d), back(c), [0, 0, -1]);
      push(back(a), back(b), back(d), [0, 0, -1]);

      // Side walls where the neighbouring cell is not part of the relief.
      const wall = (p: number, q: number, out: [number, number, number]) => {
        push(front(p), front(q), back(q), out);
        push(front(p), back(q), back(p), out);
      };
      if (!cellIn(i, j - 1)) wall(a, b, [0, 1, 0]);
      if (!cellIn(i, j + 1)) wall(c, d, [0, -1, 0]);
      if (!cellIn(i - 1, j)) wall(a, c, [-1, 0, 0]);
      if (!cellIn(i + 1, j)) wall(b, d, [1, 0, 0]);
    }
  }

  const out = compact(new Uint32Array(tris), positions, null, colors);
  return { positions: out.positions, colors: out.vertexColors!, indices: out.indices };
}
