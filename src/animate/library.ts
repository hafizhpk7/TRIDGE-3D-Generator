import {
  AnimationClip,
  QuaternionKeyframeTrack,
  Quaternion,
  Vector3,
  VectorKeyframeTrack,
  type Skeleton,
  type SkinnedMesh,
} from 'three';
import { MOTIONS } from '../rig/motions';
import type { RigBodyType } from '../rig/skeleton';
import type { AnimEntry, AnimParams, AnimTarget, ClipId, Vec3 } from './types';

const TAU = Math.PI * 2;
const FPS = 30;

// ---- context: facts about the skeleton that animations adapt to ------------------------------------

export interface ClipCtx {
  has(name: string): boolean;
  /** Rest position of a bone in the model's space. */
  rest(name: string): Vec3 | undefined;
  /** Approximate model height. */
  height: number;
  /** Height of the hip joint above the ground, a stand-in for leg length. */
  legLen: number;
  /** Chain bones that exist, in order. */
  chain(prefix: string): string[];
  /**
   * Angle to turn an arm or wing bone around the front axis so that it points `target` radians
   * above horizontal. Works whether the model rests with arms out or hanging down.
   */
  raise(bone: string, target: number): number;
  /** Is this arm or wing hanging down at rest? */
  hangsDown(bone: string): boolean;
}

/** Rest positions come from the skeleton's bind pose, so they stay right even if the bones are posed. */
function restPositions(skeleton: Skeleton): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  skeleton.bones.forEach((bone, i) => {
    const inv = skeleton.boneInverses[i];
    if (!inv) return;
    const p = new Vector3().setFromMatrixPosition(inv.clone().invert());
    out.set(bone.name, [p.x, p.y, p.z]);
  });
  return out;
}

/** Direction from a bone to the centre of the vertices it mainly moves, at rest. */
function limbDirection(meshes: SkinnedMesh[], boneIndex: number, origin: Vec3): Vec3 | null {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const mesh of meshes) {
    const idx = mesh.geometry.getAttribute('skinIndex');
    const wts = mesh.geometry.getAttribute('skinWeight');
    const pos = mesh.geometry.getAttribute('position');
    if (!idx || !wts || !pos) continue;
    for (let v = 0; v < pos.count; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++)
        if (idx.getComponent(v, k) === boneIndex) w += wts.getComponent(v, k);
      if (w < 0.6) continue;
      sx += pos.getX(v);
      sy += pos.getY(v);
      sz += pos.getZ(v);
      n++;
    }
  }
  if (n < 3) return null;
  const d: Vec3 = [sx / n - origin[0], sy / n - origin[1], sz / n - origin[2]];
  const len = Math.hypot(...d);
  return len > 1e-6 ? [d[0] / len, d[1] / len, d[2] / len] : null;
}

export function makeContext(target: AnimTarget): ClipCtx {
  const rest = restPositions(target.skeleton);
  const names = new Set(target.skeleton.bones.map((b) => b.name));
  let top = 0;
  for (const p of rest.values()) top = Math.max(top, p[1]);
  const height = Math.max(0.5, top * 1.25);
  const hipBone = ['leg_front_l', 'leg_l', 'leg_back_l', 'hips', 'body'].find((n) => rest.has(n));
  const legLen = hipBone ? Math.max(0.2, rest.get(hipBone)![1]) : height * 0.45;
  const indexOf = new Map(target.skeleton.bones.map((b, i) => [b.name, i]));
  const { left } = target.frame;

  const direction = (bone: string): { dl: number; dy: number } => {
    const i = indexOf.get(bone);
    const origin = rest.get(bone);
    if (i === undefined || !origin) return { dl: 1, dy: 0 };
    const d = limbDirection(target.meshes, i, origin);
    if (!d) return { dl: 1, dy: 0 }; // assume it points straight out to the side
    const sign = bone.endsWith('_r') ? -1 : 1;
    return { dl: sign * (d[0] * left[0] + d[2] * left[2]), dy: d[1] };
  };

  return {
    has: (n) => names.has(n),
    rest: (n) => rest.get(n),
    height,
    legLen,
    chain: (prefix) => {
      const out: string[] = [];
      for (let i = 1; names.has(`${prefix}_${i}`); i++) out.push(`${prefix}_${i}`);
      return out;
    },
    raise: (bone, targetAngle) => {
      const { dl, dy } = direction(bone);
      const current = Math.atan2(dy, dl);
      const turn = targetAngle - current;
      return bone.endsWith('_r') ? -turn : turn;
    },
    hangsDown: (bone) => direction(bone).dy < -0.5,
  };
}

// ---- poses and clip definitions -----------------------------------------------------------------------

/**
 * Rotation angles per bone, in radians, about the model's side axis (positive swings a leg back and tips the head
 * down), its up axis (turns left), and its front axis (raises a left arm). `root` is a movement of the whole body,
 * in fractions of the model's height.
 */
export interface Pose {
  rot: Record<string, Vec3>;
  root?: Vec3;
}

export interface ClipDef {
  label: string;
  loop: boolean;
  /** Length in seconds at normal speed. */
  seconds: (ctx: ClipCtx) => number;
  sample: (u: number, ctx: ClipCtx, k: number) => Pose;
}

const sin = Math.sin;
const cos = Math.cos;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Longer legs take slower, longer steps. */
const stride = (ctx: ClipCtx) => Math.min(1.8, Math.max(0.6, Math.sqrt(ctx.legLen / 0.8)));

function tails(pose: Pose, ctx: ClipCtx, f: (i: number) => number, axis: 'up' | 'side' = 'up') {
  ctx.chain('tail').forEach((name, i) => {
    pose.rot[name] = axis === 'up' ? [0, f(i), 0] : [f(i), 0, 0];
  });
}

const QUAD: Partial<Record<ClipId, ClipDef>> = {
  idle: {
    label: 'Idle',
    loop: true,
    seconds: () => 3.2,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = {
        rot: {
          spine: [sin(p) * 0.018 * k, 0, 0],
          chest: [sin(p) * 0.02 * k, 0, 0],
          head: [sin(p + 1) * 0.03 * k, sin(p) * 0.08 * k, 0],
        },
        root: [0, sin(p) * 0.004 * k, 0],
      };
      tails(pose, ctx, (i) => sin(p - i * 0.7) * 0.15 * k);
      return pose;
    },
  },
  walk: {
    label: 'Walk',
    loop: true,
    seconds: (ctx) => 1.1 * stride(ctx),
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const a = 0.5 * k;
      const pose: Pose = {
        rot: {
          leg_front_l: [sin(p) * a, 0, 0],
          leg_back_r: [sin(p) * a, 0, 0],
          leg_front_r: [sin(p + Math.PI) * a, 0, 0],
          leg_back_l: [sin(p + Math.PI) * a, 0, 0],
          spine: [0, sin(p) * 0.07 * k, 0],
          head: [sin(2 * p) * 0.04 * k, -sin(p) * 0.05 * k, 0],
        },
        root: [0, ((1 - cos(2 * p)) / 2) * 0.02 * k, 0],
      };
      tails(pose, ctx, (i) => sin(p - i * 0.6) * 0.25 * k);
      return pose;
    },
  },
  trot: {
    label: 'Trot',
    loop: true,
    seconds: (ctx) => 0.75 * stride(ctx),
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const a = 0.7 * k;
      const pose: Pose = {
        rot: {
          leg_front_l: [sin(p) * a, 0, 0],
          leg_back_r: [sin(p) * a, 0, 0],
          leg_front_r: [sin(p + Math.PI) * a, 0, 0],
          leg_back_l: [sin(p + Math.PI) * a, 0, 0],
          spine: [0, sin(p) * 0.05 * k, 0],
          head: [sin(2 * p) * 0.05 * k, 0, 0],
        },
        root: [0, Math.abs(sin(p)) * 0.035 * k, 0],
      };
      tails(pose, ctx, (i) => sin(p - i * 0.6) * 0.3 * k);
      return pose;
    },
  },
  run: {
    label: 'Run',
    loop: true,
    seconds: (ctx) => 0.5 * stride(ctx),
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const a = 0.95 * k;
      // a gallop: the front legs reach together, then the back legs push together
      const pose: Pose = {
        rot: {
          leg_front_l: [sin(p) * a, 0, 0],
          leg_front_r: [sin(p + 0.15) * a, 0, 0],
          leg_back_l: [sin(p + 2.2) * a, 0, 0],
          leg_back_r: [sin(p + 2.35) * a, 0, 0],
          spine: [sin(p + 0.4) * 0.16 * k, 0, 0],
          chest: [sin(p + 0.9) * 0.08 * k, 0, 0],
          head: [sin(p + 1.5) * 0.12 * k, 0, 0],
        },
        root: [0, (0.5 + 0.5 * sin(p + 1)) * 0.07 * k, 0],
      };
      tails(pose, ctx, (i) => 0.2 * k + sin(p - i * 0.5) * 0.1 * k, 'side');
      return pose;
    },
  },
  jump: {
    label: 'Jump',
    loop: false,
    seconds: () => 1.25,
    sample: (u, ctx, k) => {
      const crouch = smooth(0, 0.22, u) * (1 - smooth(0.22, 0.34, u));
      const air = smooth(0.2, 0.38, u) * (1 - smooth(0.62, 0.8, u));
      const s = Math.min(1, Math.max(0, (u - 0.26) / 0.44));
      const lift = 4 * s * (1 - s) * 0.55 * k;
      const land = smooth(0.66, 0.82, u) * (1 - smooth(0.82, 1, u));
      const tuck = 0.6 + 0.4 * k;
      const pose: Pose = {
        rot: {
          hips: [0.2 * crouch + 0.1 * land, 0, 0],
          spine: [0.12 * crouch - 0.18 * air * tuck, 0, 0],
          leg_front_l: [-0.9 * air * tuck + 0.3 * crouch, 0, 0],
          leg_front_r: [-0.9 * air * tuck + 0.3 * crouch, 0, 0],
          leg_back_l: [0.8 * air * tuck - 0.3 * crouch, 0, 0],
          leg_back_r: [0.8 * air * tuck - 0.3 * crouch, 0, 0],
          head: [-0.2 * air, 0, 0],
        },
        root: [0, lift, 0],
      };
      tails(pose, ctx, () => 0.25 * air * tuck, 'side');
      return pose;
    },
  },
  sit: {
    label: 'Sit',
    loop: false,
    seconds: () => 1.2,
    sample: (u, ctx) => {
      const e = smooth(0, 0.6, u);
      const pose: Pose = {
        rot: {
          hips: [-0.55 * e, 0, 0],
          leg_back_l: [-0.7 * e, 0, 0],
          leg_back_r: [-0.7 * e, 0, 0],
          leg_front_l: [0.55 * e, 0, 0],
          leg_front_r: [0.55 * e, 0, 0],
          head: [0.2 * e, 0, 0],
        },
      };
      tails(pose, ctx, () => 0.3 * e, 'side');
      return pose;
    },
  },
  lie_down: {
    label: 'Lie down',
    loop: false,
    seconds: () => 1.6,
    sample: (u, ctx) => {
      const e = smooth(0, 0.7, u);
      const drop = (ctx.legLen * 0.62 * e) / ctx.height;
      const pose: Pose = {
        rot: {
          hips: [-0.15 * e, 0, 0],
          leg_front_l: [-1.35 * e, 0, 0],
          leg_front_r: [-1.35 * e, 0, 0],
          leg_back_l: [-1.2 * e, 0, 0],
          leg_back_r: [-1.2 * e, 0, 0],
          head: [0.35 * e, 0, 0],
        },
        root: [0, -drop, 0],
      };
      tails(pose, ctx, () => 0.15 * e, 'side');
      return pose;
    },
  },
  stretch: {
    label: 'Stretch',
    loop: false,
    seconds: () => 2.6,
    sample: (u, ctx) => {
      // bow forward, hold, then stand up again
      const e = smooth(0, 0.3, u) * (1 - smooth(0.72, 1, u));
      const pose: Pose = {
        rot: {
          hips: [-0.3 * e, 0, 0],
          chest: [0.55 * e, 0, 0],
          leg_front_l: [-0.5 * e, 0, 0],
          leg_front_r: [-0.5 * e, 0, 0],
          leg_back_l: [0.3 * e, 0, 0],
          leg_back_r: [0.3 * e, 0, 0],
          head: [-0.3 * e, 0, 0],
        },
      };
      tails(pose, ctx, (i) => -0.4 * e + sin(u * TAU * 2 - i) * 0.05, 'side');
      return pose;
    },
  },
  tail_wag: {
    label: 'Tail wag',
    loop: true,
    seconds: () => 1.2,
    sample: (u, ctx, k) => {
      const p = u * TAU * 3;
      const pose: Pose = { rot: { hips: [0, sin(p) * 0.05 * k, 0], head: [0, 0, 0] } };
      tails(pose, ctx, (i) => sin(p - i * 0.4) * (0.5 + 0.15 * i) * k);
      return pose;
    },
  },
  look_around: {
    label: 'Look around',
    loop: true,
    seconds: () => 4.2,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = {
        rot: {
          neck: [0, sin(p) * 0.4 * k, 0],
          head: [sin(2 * p) * 0.06 * k, sin(p) * 0.65 * k, 0],
          chest: [0, sin(p) * 0.08 * k, 0],
        },
      };
      tails(pose, ctx, (i) => sin(p * 2 - i) * 0.12 * k);
      return pose;
    },
  },
};

const BIPED: Partial<Record<ClipId, ClipDef>> = {
  idle: {
    label: 'Idle',
    loop: true,
    seconds: () => 3.2,
    sample: (u, _ctx, k) => {
      const p = u * TAU;
      return {
        rot: {
          spine: [sin(p) * 0.02 * k, 0, 0],
          chest: [sin(p) * 0.02 * k, 0, 0],
          head: [sin(p + 1) * 0.03 * k, sin(p * 0.5) * 0.08 * k, 0],
          arm_l: [0, 0, sin(p) * 0.03 * k],
          arm_r: [0, 0, -sin(p) * 0.03 * k],
        },
        root: [0, sin(p) * 0.004 * k, 0],
      };
    },
  },
  walk: {
    label: 'Walk',
    loop: true,
    seconds: (ctx) => 1.1 * stride(ctx),
    sample: (u, _ctx, k) => {
      const p = u * TAU;
      return {
        rot: {
          leg_l: [sin(p) * 0.6 * k, 0, 0],
          leg_r: [sin(p + Math.PI) * 0.6 * k, 0, 0],
          arm_l: [sin(p + Math.PI) * 0.55 * k, 0, 0],
          arm_r: [sin(p) * 0.55 * k, 0, 0],
          spine: [0, sin(p) * 0.1 * k, 0],
          head: [0, -sin(p) * 0.06 * k, 0],
        },
        root: [0, ((1 - cos(2 * p)) / 2) * 0.02 * k, 0],
      };
    },
  },
  run: {
    label: 'Run',
    loop: true,
    seconds: (ctx) => 0.62 * stride(ctx),
    sample: (u, _ctx, k) => {
      const p = u * TAU;
      return {
        rot: {
          leg_l: [sin(p) * 1.0 * k, 0, 0],
          leg_r: [sin(p + Math.PI) * 1.0 * k, 0, 0],
          arm_l: [sin(p + Math.PI) * 1.0 * k, 0, 0],
          arm_r: [sin(p) * 1.0 * k, 0, 0],
          spine: [0.2 * k, sin(p) * 0.12 * k, 0],
          head: [-0.1 * k, 0, 0],
        },
        root: [0, Math.abs(sin(p)) * 0.05 * k, 0],
      };
    },
  },
  jump: {
    label: 'Jump',
    loop: false,
    seconds: () => 1.2,
    sample: (u, ctx, k) => {
      const crouch = smooth(0, 0.22, u) * (1 - smooth(0.22, 0.34, u));
      const air = smooth(0.2, 0.38, u) * (1 - smooth(0.62, 0.8, u));
      const s = Math.min(1, Math.max(0, (u - 0.26) / 0.44));
      const up = 0.5 * air;
      return {
        rot: {
          spine: [0.2 * crouch, 0, 0],
          leg_l: [-0.5 * air * k - 0.2 * crouch, 0, 0],
          leg_r: [-0.5 * air * k - 0.2 * crouch, 0, 0],
          arm_l: [0, 0, ctx.raise('arm_l', 1.3) * up * k * 0.9],
          arm_r: [0, 0, ctx.raise('arm_r', 1.3) * up * k * 0.9],
        },
        root: [0, 4 * s * (1 - s) * 0.5 * k, 0],
      };
    },
  },
  wave: {
    label: 'Wave',
    loop: true,
    seconds: () => 2.4,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const lift = smooth(0, 0.12, u) * (1 - smooth(0.88, 1, u));
      const around = ctx.raise('arm_l', 1.75);
      return {
        rot: {
          arm_l: [0, 0, around * lift + sin(p * 4) * 0.28 * k * lift],
          head: [0, 0, -0.1 * lift],
          chest: [0, 0, -0.04 * lift],
        },
      };
    },
  },
  dance: {
    label: 'Dance',
    loop: true,
    seconds: () => 2.0,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      return {
        rot: {
          hips: [0, sin(p) * 0.25 * k, sin(p * 2) * 0.06 * k],
          spine: [0, -sin(p) * 0.18 * k, 0],
          leg_l: [Math.max(0, sin(p * 2)) * 0.5 * k, 0, 0],
          leg_r: [Math.max(0, -sin(p * 2)) * 0.5 * k, 0, 0],
          arm_l: [0, 0, ctx.raise('arm_l', 1.4) * (0.5 + 0.5 * sin(p * 2)) * k],
          arm_r: [0, 0, ctx.raise('arm_r', 1.4) * (0.5 - 0.5 * sin(p * 2)) * k],
          head: [sin(p * 2) * 0.1 * k, sin(p) * 0.2 * k, 0],
        },
        root: [0, Math.abs(sin(p * 2)) * 0.03 * k, 0],
      };
    },
  },
  sit: {
    label: 'Sit',
    loop: false,
    seconds: () => 1.2,
    sample: (u, ctx) => {
      const e = smooth(0, 0.6, u);
      return {
        rot: {
          leg_l: [-1.45 * e, 0, 0],
          leg_r: [-1.45 * e, 0, 0],
          spine: [0.05 * e, 0, 0],
        },
        root: [0, -(ctx.legLen * 0.9 * e) / ctx.height, 0],
      };
    },
  },
  clap: {
    label: 'Clap',
    loop: true,
    seconds: () => 1.6,
    sample: (u, ctx, k) => {
      const p = u * TAU * 4;
      const ease = smooth(0, 0.1, u) * (1 - smooth(0.9, 1, u));
      const inward = (0.5 + 0.5 * cos(p)) * 0.45 * k * ease;
      const down = ctx.hangsDown('arm_l');
      // Left arm closes toward the middle with a negative turn about the up axis; the right arm is the mirror.
      const arm = (inwardSign: 1 | -1): Vec3 =>
        down
          ? [-1.35 * ease, inwardSign * inward, 0] // hanging arms swing forward first
          : [0, inwardSign * (1.35 * ease + inward), 0]; // outstretched arms swing around to the front
      return { rot: { arm_l: arm(-1), arm_r: arm(1) } };
    },
  },
};

const BIRD: Partial<Record<ClipId, ClipDef>> = {
  idle: {
    label: 'Idle',
    loop: true,
    seconds: () => 2.4,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = {
        rot: {
          head: [Math.max(0, sin(p * 2)) * 0.25 * k, sin(p) * 0.3 * k, 0],
          body: [sin(p) * 0.02 * k, 0, 0],
        },
      };
      tails(pose, ctx, (i) => sin(p - i * 0.5) * 0.12 * k, 'side');
      return pose;
    },
  },
  hop: {
    label: 'Hop',
    loop: true,
    seconds: () => 0.7,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const air = Math.max(0, sin(p));
      const pose: Pose = {
        rot: {
          leg_l: [-0.4 * air * k, 0, 0],
          leg_r: [-0.4 * air * k, 0, 0],
          body: [-0.15 * air * k, 0, 0],
          wing_l: [0, 0, 0.2 * air * k],
          wing_r: [0, 0, -0.2 * air * k],
        },
        root: [0, air * 0.12 * k, 0],
      };
      tails(pose, ctx, () => 0.2 * air * k, 'side');
      return pose;
    },
  },
  flap: {
    label: 'Flap',
    loop: true,
    seconds: () => 0.5,
    sample: (u, _ctx, k) => {
      const p = u * TAU;
      return {
        rot: {
          wing_l: [0, 0, sin(p) * 0.9 * k],
          wing_r: [0, 0, -sin(p) * 0.9 * k],
          body: [sin(p + 1.6) * 0.06 * k, 0, 0],
        },
        root: [0, sin(p + 1.6) * 0.03 * k, 0],
      };
    },
  },
  fly: {
    label: 'Fly',
    loop: true,
    seconds: () => 0.55,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = {
        rot: {
          wing_l: [0, 0, sin(p) * 1.1 * k],
          wing_r: [0, 0, -sin(p) * 1.1 * k],
          body: [-0.18 + sin(p + 1.6) * 0.05 * k, 0, 0],
          leg_l: [-0.9, 0, 0],
          leg_r: [-0.9, 0, 0],
          head: [0.1, 0, 0],
        },
        root: [0, 0.35 + sin(p + 1.6) * 0.04 * k, 0],
      };
      tails(pose, ctx, (i) => sin(p - i * 0.4) * 0.1 * k, 'side');
      return pose;
    },
  },
};

const FISH: Partial<Record<ClipId, ClipDef>> = {
  idle: {
    label: 'Idle',
    loop: true,
    seconds: () => 3,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = {
        rot: { fin_l: [0, 0, sin(p) * 0.15 * k], fin_r: [0, 0, -sin(p) * 0.15 * k] },
        root: [0, sin(p) * 0.01 * k, 0],
      };
      tails(pose, ctx, (i) => sin(p - i * 0.8) * 0.12 * k);
      return pose;
    },
  },
  swim: {
    label: 'Swim',
    loop: true,
    seconds: () => 1.3,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = {
        rot: {
          body: [0, sin(p) * 0.1 * k, 0],
          head: [0, -sin(p) * 0.08 * k, 0],
          fin_l: [0, 0, sin(p * 2) * 0.35 * k],
          fin_r: [0, 0, -sin(p * 2) * 0.35 * k],
          fin_top: [0, 0, sin(p) * 0.1 * k],
        },
        root: [0, sin(p * 0.5) * 0.02 * k, 0],
      };
      tails(pose, ctx, (i) => sin(p - (i + 1) * 0.8) * (0.3 + 0.12 * i) * k);
      return pose;
    },
  },
};

const SNAKE: Partial<Record<ClipId, ClipDef>> = {
  idle: {
    label: 'Idle',
    loop: true,
    seconds: () => 3,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = { rot: { head: [0, sin(p) * 0.15 * k, 0] } };
      ctx.chain('segment').forEach((n, i) => (pose.rot[n] = [0, sin(p - i * 0.7) * 0.06 * k, 0]));
      return pose;
    },
  },
  slither: {
    label: 'Slither',
    loop: true,
    seconds: () => 1.6,
    sample: (u, ctx, k) => {
      const p = u * TAU;
      const pose: Pose = { rot: { head: [0, sin(p) * 0.3 * k, 0] } };
      ctx.chain('segment').forEach((n, i) => (pose.rot[n] = [0, sin(p - i * 0.9) * 0.45 * k, 0]));
      return pose;
    },
  },
};

export const CLIP_LIBRARY: Record<RigBodyType, Partial<Record<ClipId, ClipDef>>> = {
  quadruped: QUAD,
  biped: BIPED,
  bird: BIRD,
  fish: FISH,
  snake: SNAKE,
  object: {},
};

// ---- what is available -----------------------------------------------------------------------------------

const MOTION_ENTRIES: AnimEntry[] = MOTIONS.map((m) => ({
  id: m.id,
  label: m.label,
  kind: 'motion',
  loop: true,
}));

/** Animations a target can play: its bone clips, then the whole-model motions every model has. */
export function availableAnimations(bodyType: RigBodyType | null): AnimEntry[] {
  const clips: AnimEntry[] = bodyType
    ? Object.entries(CLIP_LIBRARY[bodyType]).map(([id, def]) => ({
        id: id as ClipId,
        label: def!.label,
        kind: 'clip' as const,
        loop: def!.loop,
      }))
    : [];
  // A bone clip hides the whole-model motion of the same name (a bird's hop is better than a bounce).
  const taken = new Set(clips.map((c) => c.id));
  return [...clips, ...MOTION_ENTRIES.filter((m) => !taken.has(m.id))];
}

// ---- turning definitions into AnimationClips ---------------------------------------------------------------

/** Length of one clip in seconds, with the speed setting applied. */
export function clipSeconds(
  bodyType: RigBodyType,
  id: ClipId,
  ctx: ClipCtx,
  params: AnimParams,
): number {
  const def = CLIP_LIBRARY[bodyType][id];
  if (!def) return 0;
  return def.seconds(ctx) / Math.max(0.05, params.speed);
}

/**
 * Sample a definition into keyframes. Only bones that exist get tracks, so partial skeletons still animate.
 * Looping clips end exactly where they start.
 */
export function buildClip(
  target: AnimTarget,
  id: ClipId,
  params: AnimParams,
  ctx = makeContext(target),
): AnimationClip | null {
  const def = CLIP_LIBRARY[target.bodyType][id];
  if (!def) return null;
  const seconds = clipSeconds(target.bodyType, id, ctx, params);
  const frames = Math.max(2, Math.round(seconds * FPS) + 1);
  const times = Array.from({ length: frames }, (_, i) => (i / (frames - 1)) * seconds);
  const k = Math.max(0, params.intensity);

  const rotations = new Map<string, number[]>();
  const rootOffsets: number[] = [];
  const { left, front } = target.frame;
  const axisSide = new Vector3(...left);
  const axisUp = new Vector3(0, 1, 0);
  const axisFront = new Vector3(...front);
  const qs = new Quaternion();
  const qu = new Quaternion();
  const qf = new Quaternion();
  const q = new Quaternion();

  for (let i = 0; i < frames; i++) {
    const u = i / (frames - 1);
    const pose = def.sample(u, ctx, k);
    for (const [name, a] of Object.entries(pose.rot)) {
      if (!ctx.has(name)) continue;
      qs.setFromAxisAngle(axisSide, a[0]);
      qu.setFromAxisAngle(axisUp, a[1]);
      qf.setFromAxisAngle(axisFront, a[2]);
      q.copy(qu).multiply(qf).multiply(qs);
      let arr = rotations.get(name);
      if (!arr) {
        arr = new Array<number>(i * 4).fill(0).map((_, j) => (j % 4 === 3 ? 1 : 0));
        rotations.set(name, arr);
      }
      arr.push(q.x, q.y, q.z, q.w);
    }
    // bones a pose skips at some frames stay at rest
    for (const arr of rotations.values()) if (arr.length < (i + 1) * 4) arr.push(0, 0, 0, 1);
    const r = pose.root ?? [0, 0, 0];
    rootOffsets.push(r[0] * ctx.height, r[1] * ctx.height, r[2] * ctx.height);
  }

  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = [];
  for (const [name, values] of rotations)
    tracks.push(new QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
  const rootRest = ctx.has('root')
    ? target.skeleton.bones.find((b) => b.name === 'root')
    : undefined;
  if (rootRest && rootOffsets.some((v) => Math.abs(v) > 1e-9)) {
    const base = rootRest.position;
    const vals: number[] = [];
    for (let i = 0; i < frames; i++)
      vals.push(
        base.x + rootOffsets[i * 3],
        base.y + rootOffsets[i * 3 + 1],
        base.z + rootOffsets[i * 3 + 2],
      );
    tracks.push(new VectorKeyframeTrack('root.position', times, vals));
  }
  const clip = new AnimationClip(`${target.bodyType}:${id}`, seconds, tracks);
  return clip;
}
