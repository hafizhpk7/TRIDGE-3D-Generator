import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Part, TubePart } from '../spec/types';

const DEG = Math.PI / 180;

/** Segment counts for a detail level (section 5.2). */
export function segmentsFor(shape: Part['shape'], detail: number, sides?: number) {
  const d = Math.min(10, Math.max(1, Math.round(detail)));
  const radial = sides ?? Math.max(4, 2 + d);
  return {
    sphereW: sides ?? Math.max(3, 2 + d),
    sphereH: Math.max(3, Math.round(0.75 * (sides ?? 2 + d))),
    radial,
    torusRadial: sides ?? 3 + d,
    torusTubular: 6 + 2 * d,
    boxSegments: d > 6 ? 2 : 1,
    tubeRadial: sides ?? Math.max(4, 2 + d),
    shape,
  };
}

/** Geometry for one part, placed in model space and unrolled to separate triangles. */
export interface PartMesh {
  /** 9 numbers per triangle. */
  positions: Float32Array;
  /**
   * Tubes only: position along the curve (0..1) for each vertex, used for smooth bone chain skinning.
   */
  curveT: Float32Array | null;
}

function placed(geometry: BufferGeometry, part: Part): BufferGeometry {
  const r = part.rotation ?? [0, 0, 0];
  const m = new Matrix4().compose(
    new Vector3(...part.position),
    new Quaternion().setFromEuler(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ')),
    new Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(m);
  return geometry;
}

function unrolled(geometry: BufferGeometry): Float32Array {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const out = new Float32Array(flat.getAttribute('position').array);
  geometry.dispose();
  if (flat !== geometry) flat.dispose();
  return out;
}

/** A tube whose radius changes along its length, with closed ends. */
export function buildTube(part: TubePart, detail: number): PartMesh {
  const seg = segmentsFor('tube', detail, part.sides);
  const radial = seg.tubeRadial;
  const tubular = 4 * part.points.length;
  const curve = new CatmullRomCurve3(
    part.points.map((p) => new Vector3(...p)),
    false,
    'centripetal',
  );
  const frames = curve.computeFrenetFrames(tubular, false);

  const ring: Vector3[][] = [];
  const centers: Vector3[] = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const c = curve.getPointAt(t);
    centers.push(c);
    const radius = part.radiusStart + (part.radiusEnd - part.radiusStart) * t;
    const n = frames.normals[i];
    const b = frames.binormals[i];
    const row: Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      row.push(
        new Vector3()
          .addScaledVector(n, Math.cos(a) * radius)
          .addScaledVector(b, Math.sin(a) * radius)
          .add(c),
      );
    }
    ring.push(row);
  }

  const pos: number[] = [];
  const ts: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3, ta: number, tb: number, tc: number) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    ts.push(ta, tb, tc);
  };
  for (let i = 0; i < tubular; i++) {
    const t0 = i / tubular;
    const t1 = (i + 1) / tubular;
    for (let j = 0; j < radial; j++) {
      const k = (j + 1) % radial;
      const a = ring[i][j];
      const b = ring[i + 1][j];
      const c = ring[i + 1][k];
      const d = ring[i][k];
      tri(a, d, b, t0, t0, t1);
      tri(b, d, c, t1, t0, t1);
    }
  }
  // end caps
  for (let j = 0; j < radial; j++) {
    const k = (j + 1) % radial;
    tri(centers[0], ring[0][k], ring[0][j], 0, 0, 0);
    tri(centers[tubular], ring[tubular][j], ring[tubular][k], 1, 1, 1);
  }
  return { positions: new Float32Array(pos), curveT: new Float32Array(ts) };
}

/** Build one part at a detail level (1..10). */
export function buildPartMesh(part: Part, detail: number): PartMesh {
  const seg = segmentsFor(part.shape, detail, part.sides);
  switch (part.shape) {
    case 'sphere': {
      const g = new SphereGeometry(1, seg.sphereW, seg.sphereH);
      g.scale(part.radii[0], part.radii[1], part.radii[2]);
      return { positions: unrolled(placed(g, part)), curveT: null };
    }
    case 'box': {
      const [w, h, d] = part.size;
      const bevel = part.bevel ?? 0;
      const g =
        bevel > 0
          ? new RoundedBoxGeometry(
              w,
              h,
              d,
              seg.boxSegments,
              Math.min(bevel, 0.5) * Math.min(w, h, d),
            )
          : new BoxGeometry(w, h, d);
      return { positions: unrolled(placed(g, part)), curveT: null };
    }
    case 'cylinder': {
      const g = new CylinderGeometry(part.radiusTop, part.radiusBottom, part.height, seg.radial, 1);
      return { positions: unrolled(placed(g, part)), curveT: null };
    }
    case 'cone': {
      const g = new ConeGeometry(part.radius, part.height, seg.radial, 1);
      return { positions: unrolled(placed(g, part)), curveT: null };
    }
    case 'capsule': {
      const g = new CapsuleGeometry(
        part.radius,
        part.length,
        Math.max(2, Math.round(seg.radial / 2)),
        seg.radial,
      );
      return { positions: unrolled(placed(g, part)), curveT: null };
    }
    case 'torus': {
      const arc = (part.arc ?? 360) * DEG;
      const g = new TorusGeometry(part.radius, part.tube, seg.torusRadial, seg.torusTubular, arc);
      return { positions: unrolled(placed(g, part)), curveT: null };
    }
    case 'tube':
      // Tubes are described in model space already, so position and rotation do not apply.
      return buildTube(part, detail);
  }
}
