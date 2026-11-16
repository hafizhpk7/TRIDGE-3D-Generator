import { boundsOf, type TriangleSoup } from './triangles';

export interface PrintOptions {
  /** Height of the finished model, in millimetres. */
  heightMm: number;
  /** Turn the model so +Z is up, which is what slicers expect. glTF and most game tools use +Y. */
  zUp: boolean;
}

export const DEFAULT_PRINT: PrintOptions = { heightMm: 80, zUp: true };

/**
 * Move the soup onto the print bed: centred, standing on the floor, scaled to the requested height.
 * Returns new positions; the input is left alone.
 */
export function fitToBed(soup: TriangleSoup, opts: PrintOptions): Float32Array {
  const src = soup.positions;
  const out = new Float32Array(src.length);
  if (src.length === 0) return out;
  const { min, max } = boundsOf(src);
  const height = Math.max(1e-9, max.y - min.y);
  const k = Math.max(0.001, opts.heightMm) / height;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  for (let i = 0; i < src.length; i += 3) {
    const x = (src[i] - cx) * k;
    const y = (src[i + 1] - min.y) * k;
    const z = (src[i + 2] - cz) * k;
    if (opts.zUp) {
      // a turn of 90 degrees about X: up becomes +Z and the front turns toward -Y, so it stays a proper rotation
      out[i] = x;
      out[i + 1] = -z;
      out[i + 2] = y;
    } else {
      out[i] = x;
      out[i + 1] = y;
      out[i + 2] = z;
    }
  }
  return out;
}

/** Bytes of a binary STL with this many triangles. */
export const stlSize = (triangles: number) => 84 + 50 * triangles;

/** Binary STL. Triangles that collapse to a line are skipped, since slicers complain about them. */
export function toStl(positions: Float32Array, name = 'TRIDGE model'): Uint8Array {
  const total = Math.floor(positions.length / 9);
  const keep: number[] = [];
  const normals = new Float32Array(total * 3);
  for (let t = 0; t < total; t++) {
    const o = t * 9;
    const ux = positions[o + 3] - positions[o];
    const uy = positions[o + 4] - positions[o + 1];
    const uz = positions[o + 5] - positions[o + 2];
    const vx = positions[o + 6] - positions[o];
    const vy = positions[o + 7] - positions[o + 1];
    const vz = positions[o + 8] - positions[o + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue;
    normals[t * 3] = nx / len;
    normals[t * 3 + 1] = ny / len;
    normals[t * 3 + 2] = nz / len;
    keep.push(t);
  }
  const buffer = new ArrayBuffer(stlSize(keep.length));
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(name.slice(0, 79));
  new Uint8Array(buffer).set(header, 0);
  view.setUint32(80, keep.length, true);
  let at = 84;
  for (const t of keep) {
    for (let k = 0; k < 3; k++) {
      view.setFloat32(at, normals[t * 3 + k], true);
      at += 4;
    }
    for (let k = 0; k < 9; k++) {
      view.setFloat32(at, positions[t * 9 + k], true);
      at += 4;
    }
    view.setUint16(at, 0, true);
    at += 2;
  }
  return new Uint8Array(buffer);
}

const num = (n: number) => {
  const s = n.toFixed(5);
  // trim trailing zeros to keep the file small
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

/**
 * Wavefront OBJ. Identical corners are shared. When the model has colors they are written after each vertex as
 * "v x y z r g b", which Blender, MeshLab and most viewers understand.
 */
export function toObj(
  positions: Float32Array,
  colors: Float32Array | null,
  name = 'model',
): string {
  const lines: string[] = [`# TRIDGE`, `o ${name.replace(/\s+/g, '_')}`];
  const ids = new Map<string, number>();
  const faces: string[] = [];
  const total = Math.floor(positions.length / 9);
  for (let t = 0; t < total; t++) {
    const face: number[] = [];
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const x = num(positions[o]);
      const y = num(positions[o + 1]);
      const z = num(positions[o + 2]);
      let line = `v ${x} ${y} ${z}`;
      if (colors) line += ` ${num(colors[o])} ${num(colors[o + 1])} ${num(colors[o + 2])}`;
      let id = ids.get(line);
      if (id === undefined) {
        id = ids.size + 1;
        ids.set(line, id);
        lines.push(line);
      }
      face.push(id);
    }
    if (face[0] !== face[1] && face[1] !== face[2] && face[0] !== face[2])
      faces.push(`f ${face[0]} ${face[1]} ${face[2]}`);
  }
  return `${lines.join('\n')}\n${faces.join('\n')}\n`;
}
