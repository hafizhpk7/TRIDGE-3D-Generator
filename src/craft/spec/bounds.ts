import type { Part, Vec3 } from './types';

export interface Box {
  min: Vec3;
  max: Vec3;
}

const DEG = Math.PI / 180;

/** Largest extent of a part along each world axis, as half-lengths. */
export function worldHalfExtents(local: Vec3, rotation: Vec3 | undefined): Vec3 {
  if (!rotation || (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0)) return local;
  const m = rotationMatrixXYZ(rotation);
  return [
    Math.abs(m[0]) * local[0] + Math.abs(m[1]) * local[1] + Math.abs(m[2]) * local[2],
    Math.abs(m[3]) * local[0] + Math.abs(m[4]) * local[1] + Math.abs(m[5]) * local[2],
    Math.abs(m[6]) * local[0] + Math.abs(m[7]) * local[1] + Math.abs(m[8]) * local[2],
  ];
}

/** Row-major 3x3 rotation matrix for Euler XYZ (degrees), identical to three.js. */
export function rotationMatrixXYZ([rx, ry, rz]: Vec3): number[] {
  const a = Math.cos(rx * DEG);
  const b = Math.sin(rx * DEG);
  const c = Math.cos(ry * DEG);
  const d = Math.sin(ry * DEG);
  const e = Math.cos(rz * DEG);
  const f = Math.sin(rz * DEG);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}

/** Local half-extents of a part before rotation. */
function localHalf(part: Part): Vec3 {
  switch (part.shape) {
    case 'sphere':
      return part.radii;
    case 'box':
      return [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
    case 'cylinder': {
      const r = Math.max(part.radiusTop, part.radiusBottom);
      return [r, part.height / 2, r];
    }
    case 'cone':
      return [part.radius, part.height / 2, part.radius];
    case 'capsule':
      return [part.radius, part.length / 2 + part.radius, part.radius];
    case 'torus': {
      const outer = part.radius + part.tube;
      return [outer, outer, part.tube];
    }
    case 'tube':
      return [0, 0, 0];
  }
}

/** Approximate world-space bounding box of a part (rotation aware, mirror not applied). */
export function partBounds(part: Part): Box {
  if (part.shape === 'tube') {
    const r = Math.max(part.radiusStart, part.radiusEnd);
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of part.points) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p[i] - r);
        max[i] = Math.max(max[i], p[i] + r);
      }
    }
    return { min, max };
  }
  const h = worldHalfExtents(localHalf(part), part.rotation);
  const p = part.position;
  return {
    min: [p[0] - h[0], p[1] - h[1], p[2] - h[2]],
    max: [p[0] + h[0], p[1] + h[1], p[2] + h[2]],
  };
}

export function boxesTouch(a: Box, b: Box, slack = 0): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.min[i] - slack > b.max[i] || b.min[i] - slack > a.max[i]) return false;
  }
  return true;
}
