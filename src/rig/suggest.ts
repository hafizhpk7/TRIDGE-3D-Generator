import { makeFrame, toModel, type Facing, type Frame, type Vec3 } from './frame';
import { SKELETONS, SNAKE_SEGMENTS, type RigBodyType } from './skeleton';

export interface Suggestion {
  frame: Frame;
  /** Joint positions in model space, keyed by bone name. */
  joints: Record<string, Vec3>;
  /** Notes for the user, such as a leg search that fell back to a guess. */
  notes: string[];
}

const MAX_POINTS = 6000;

function sample(positions: ArrayLike<number>, max = MAX_POINTS): Vec3[] {
  const n = Math.floor(positions.length / 3);
  const step = Math.max(1, Math.floor(n / max));
  const out: Vec3[] = [];
  for (let i = 0; i < n; i += step)
    out.push([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
  return out;
}

/**
 * Guess which way the model faces.
 * Animals: along the longer horizontal axis, the head end is the one that stands taller (fish and
 * snakes: the thicker end). People and objects: the front-back axis is the thinner horizontal axis.
 */
export function autoFacing(bodyType: RigBodyType, positions: ArrayLike<number>): Facing {
  const pts = sample(positions);
  if (pts.length === 0) return '+z';
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[2]);
    z1 = Math.max(z1, p[2]);
  }
  const alongX = x1 - x0 > z1 - z0;

  if (bodyType === 'biped' || bodyType === 'object') {
    // The thinner horizontal axis is front to back.
    return alongX ? '+z' : '+x';
  }

  const axis = alongX ? 0 : 2;
  const lo = alongX ? x0 : z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const slab = len * 0.22;
  const stats = (inSlab: (c: number) => boolean) => {
    let n = 0,
      sumY = 0,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      if (!inSlab(p[axis])) continue;
      n++;
      sumY += p[1];
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    return { n, meanY: n ? sumY / n : 0, height: n ? maxY - minY : 0 };
  };
  const low = stats((c) => c <= lo + slab);
  const high = stats((c) => c >= lo + len - slab);
  // A thin tail sticks out past the body and has little geometry, so the bulkier end is the head.
  // When both ends are about as heavy, the end that stands taller is the head (fish and snakes: the thicker one).
  const ratio = (high.n + 1) / (low.n + 1);
  let headIsHigh: boolean;
  if (ratio > 1.6) headIsHigh = true;
  else if (ratio < 1 / 1.6) headIsHigh = false;
  else if (bodyType === 'fish' || bodyType === 'snake') headIsHigh = high.height >= low.height;
  else headIsHigh = high.meanY >= low.meanY;
  if (alongX) return headIsHigh ? '+x' : '-x';
  return headIsHigh ? '+z' : '-z';
}

/** Cluster the lowest part of the model into four leg columns. Null when it does not look like four legs. */
export function findLegColumns(
  positions: ArrayLike<number>,
  frame: Frame,
): {
  frontLeft: [number, number];
  frontRight: [number, number];
  backLeft: [number, number];
  backRight: [number, number];
} | null {
  const H = frame.v1 - frame.v0;
  const Lu = frame.u1 - frame.u0;
  const W = frame.w1 - frame.w0;
  if (H <= 0 || Lu <= 0 || W <= 0) return null;
  const wc = (frame.w0 + frame.w1) / 2;

  const pts: [number, number][] = [];
  for (const p of sample(positions, 12000)) {
    if (p[1] > frame.v0 + 0.3 * H) continue;
    pts.push([
      p[0] * frame.front[0] + p[2] * frame.front[2],
      p[0] * frame.left[0] + p[2] * frame.left[2],
    ]);
  }
  if (pts.length < 40) return null;

  let centers: [number, number][] = [
    [frame.u0 + 0.25 * Lu, wc + 0.25 * W],
    [frame.u0 + 0.25 * Lu, wc - 0.25 * W],
    [frame.u0 + 0.75 * Lu, wc + 0.25 * W],
    [frame.u0 + 0.75 * Lu, wc - 0.25 * W],
  ];
  const counts = [0, 0, 0, 0];
  for (let iter = 0; iter < 15; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    for (const [u, w] of pts) {
      let best = 0,
        bd = Infinity;
      for (let c = 0; c < 4; c++) {
        const d = (u - centers[c][0]) ** 2 + (w - centers[c][1]) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      sums[best][0] += u;
      sums[best][1] += w;
      sums[best][2]++;
    }
    centers = centers.map((c, i) =>
      sums[i][2] > 0 ? [sums[i][0] / sums[i][2], sums[i][1] / sums[i][2]] : c,
    ) as [number, number][];
    sums.forEach((s, i) => (counts[i] = s[2]));
  }
  if (counts.some((c) => c < pts.length * 0.06)) return null;

  // Real legs leave the middle of the underside empty. A solid blob does not, so it is not four legs.
  const uc = (frame.u0 + frame.u1) / 2;
  const hole = 0.15 * Math.min(Lu, W);
  const inMiddle = pts.filter(([u, w]) => Math.hypot(u - uc, w - wc) < hole).length;
  if (inMiddle > pts.length * 0.05) return null;

  const byU = [...centers].sort((a, b) => a[0] - b[0]);
  const back = byU.slice(0, 2).sort((a, b) => b[1] - a[1]); // left (larger w) first
  const front = byU.slice(2).sort((a, b) => b[1] - a[1]);
  if (back[0][1] - back[1][1] < 0.1 * W || front[0][1] - front[1][1] < 0.1 * W) return null;
  if (front[0][0] - back[0][0] < 0.15 * Lu) return null;
  return { frontLeft: front[0], frontRight: front[1], backLeft: back[0], backRight: back[1] };
}

/** Initial joint placement for a body type, from the shape of the model. */
export function suggestJoints(
  bodyType: RigBodyType,
  positions: ArrayLike<number>,
  facing: Facing,
): Suggestion {
  const frame = makeFrame(positions, facing);
  const { u0, u1, v0, v1, w0, w1 } = frame;
  const Lu = u1 - u0;
  const H = v1 - v0;
  const W = w1 - w0;
  const wc = (w0 + w1) / 2;
  const uAt = (f: number) => u0 + f * Lu;
  const vAt = (f: number) => v0 + f * H;
  const at = (uf: number, vf: number, w = wc): Vec3 => toModel(frame, uAt(uf), vAt(vf), w);
  const notes: string[] = [];
  const joints: Record<string, Vec3> = {};
  joints.root = toModel(frame, (u0 + u1) / 2, v0, wc);

  switch (bodyType) {
    case 'quadruped': {
      joints.hips = at(0.3, 0.5);
      joints.spine = at(0.5, 0.52);
      joints.chest = at(0.65, 0.5);
      joints.neck = at(0.78, 0.62);
      joints.head = at(0.86, 0.7);
      const legs = findLegColumns(positions, frame);
      const legV = vAt(0.5);
      if (legs) {
        joints.leg_front_l = toModel(frame, legs.frontLeft[0], legV, legs.frontLeft[1]);
        joints.leg_front_r = toModel(frame, legs.frontRight[0], legV, legs.frontRight[1]);
        joints.leg_back_l = toModel(frame, legs.backLeft[0], legV, legs.backLeft[1]);
        joints.leg_back_r = toModel(frame, legs.backRight[0], legV, legs.backRight[1]);
      } else {
        notes.push(
          'Could not find four separate legs, so the leg joints are a guess. Drag them into place.',
        );
        joints.leg_front_l = toModel(frame, uAt(0.68), legV, wc + 0.22 * W);
        joints.leg_front_r = toModel(frame, uAt(0.68), legV, wc - 0.22 * W);
        joints.leg_back_l = toModel(frame, uAt(0.25), legV, wc + 0.22 * W);
        joints.leg_back_r = toModel(frame, uAt(0.25), legV, wc - 0.22 * W);
      }
      joints.tail_1 = at(0.18, 0.55);
      joints.tail_2 = at(0.1, 0.6);
      joints.tail_3 = at(0.03, 0.65);
      break;
    }
    case 'biped': {
      const shoulder = Math.min(0.2 * W, 0.22 * H);
      const hip = Math.min(0.1 * W, 0.1 * H);
      joints.hips = at(0.5, 0.52);
      joints.spine = at(0.5, 0.62);
      joints.chest = at(0.5, 0.72);
      joints.neck = at(0.5, 0.84);
      joints.head = at(0.5, 0.92);
      joints.arm_l = at(0.5, 0.78, wc + shoulder);
      joints.arm_r = at(0.5, 0.78, wc - shoulder);
      joints.leg_l = at(0.5, 0.5, wc + hip);
      joints.leg_r = at(0.5, 0.5, wc - hip);
      break;
    }
    case 'bird': {
      joints.body = at(0.5, 0.5);
      joints.head = at(0.8, 0.8);
      joints.wing_l = at(0.5, 0.6, wc + 0.3 * W);
      joints.wing_r = at(0.5, 0.6, wc - 0.3 * W);
      joints.leg_l = at(0.5, 0.25, wc + 0.12 * W);
      joints.leg_r = at(0.5, 0.25, wc - 0.12 * W);
      joints.tail_1 = at(0.22, 0.5);
      joints.tail_2 = at(0.12, 0.5);
      joints.tail_3 = at(0.03, 0.5);
      break;
    }
    case 'fish': {
      joints.body = at(0.55, 0.5);
      joints.head = at(0.82, 0.5);
      joints.tail_1 = at(0.28, 0.5);
      joints.tail_2 = at(0.14, 0.5);
      joints.tail_3 = at(0.05, 0.5);
      joints.fin_l = at(0.6, 0.4, wc + 0.3 * W);
      joints.fin_r = at(0.6, 0.4, wc - 0.3 * W);
      joints.fin_top = at(0.5, 0.9);
      break;
    }
    case 'snake': {
      for (let i = 1; i <= SNAKE_SEGMENTS; i++) {
        joints[`segment_${i}`] = at(0.05 + ((i - 1) * 0.75) / (SNAKE_SEGMENTS - 1), 0.5);
      }
      joints.head = at(0.93, 0.5);
      break;
    }
    case 'object':
      break;
  }

  // Every template bone gets a position, even if a case above forgot one.
  for (const j of SKELETONS[bodyType]) if (!joints[j.name]) joints[j.name] = at(0.5, 0.5);
  return { frame, joints, notes };
}
