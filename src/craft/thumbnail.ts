import { buildCraft } from './builder/build';
import type { ShapeSpec } from './spec/types';

const cache = new Map<string, string>();

/**
 * A small picture of a spec, drawn with plain 2D canvas (no WebGL): triangles sorted back to front
 * and shaded by a fixed light. Cached by key, so each template is drawn once.
 */
export function renderThumbnail(key: string, spec: ShapeSpec, size = 144): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildCraft(spec, { detail: 4 });
  const { positions, normals, colors } = built;

  // View from the front-left, slightly above.
  const yaw = -0.6;
  const pitch = 0.35;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return [x1, y2, z2];
  };

  const tris = positions.length / 9;
  const projected = new Float32Array(tris * 9);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const [x, y, z] = project(positions[o], positions[o + 1], positions[o + 2]);
      projected.set([x, y, z], o);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const scale = (size * 0.86) / Math.max(maxX - minX, maxY - minY, 0.001);
  const ox = size / 2 - ((minX + maxX) / 2) * scale;
  const oy = size / 2 + ((minY + maxY) / 2) * scale;

  const order = Array.from({ length: tris }, (_, i) => i).sort(
    (a, b) =>
      projected[a * 9 + 2] +
      projected[a * 9 + 5] +
      projected[a * 9 + 8] -
      (projected[b * 9 + 2] + projected[b * 9 + 5] + projected[b * 9 + 8]),
  );

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const light = [0.4, 0.8, 0.45];
  const ll = Math.hypot(...light);
  for (const t of order) {
    const nx = normals[t * 9],
      ny = normals[t * 9 + 1],
      nz = normals[t * 9 + 2];
    const lit = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / ll);
    const shade = 0.55 + lit * 0.6;
    // colors are linear; show them roughly as sRGB
    const toS = (v: number) =>
      Math.round(Math.min(1, Math.pow(Math.max(0, v) * shade, 1 / 2.2)) * 255);
    ctx.fillStyle = `rgb(${toS(colors[t * 9])},${toS(colors[t * 9 + 1])},${toS(colors[t * 9 + 2])})`;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const px = ox + projected[o] * scale;
      const py = oy - projected[o + 1] * scale;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
