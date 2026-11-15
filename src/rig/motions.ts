import type { Vec3 } from './frame';

/**
 * Layer A: whole-model motion that needs no skeleton, so every mesh can be animated.
 * The model is moved as one piece, pivoting around the middle of its base on the pedestal.
 */
export type MotionId = 'bounce' | 'hop' | 'spin' | 'wobble' | 'squash' | 'float' | 'shake';

export interface MotionDef {
  id: MotionId;
  label: string;
  hint: string;
}

export const MOTIONS: MotionDef[] = [
  { id: 'bounce', label: 'Bounce', hint: 'Up and down, squashing on landing' },
  { id: 'hop', label: 'Hop', hint: 'A small jump, then a pause' },
  { id: 'spin', label: 'Spin', hint: 'Turns around' },
  { id: 'wobble', label: 'Wobble', hint: 'Rocks side to side' },
  { id: 'squash', label: 'Squash and stretch', hint: 'Gets tall, then flat' },
  { id: 'float', label: 'Float', hint: 'Drifts up and down gently' },
  { id: 'shake', label: 'Shake', hint: 'Quick little tremble' },
];

export interface MotionParams {
  /** 0.25 to 3. 1 is the normal speed. */
  speed: number;
  /** 0 to 2. 1 is the normal size of movement. */
  intensity: number;
}

export interface Transform {
  position: Vec3;
  rotation: Vec3; // radians, XYZ
  scale: Vec3;
}

export const IDENTITY: Transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

const TAU = Math.PI * 2;

/**
 * The transform of the whole model at time `t` seconds. `height` is the model's height in scene units,
 * so movement scales with the size of the model.
 */
export function motionTransform(
  id: MotionId,
  t: number,
  params: MotionParams,
  height: number,
): Transform {
  const s = Math.max(0.05, params.speed);
  const k = Math.max(0, params.intensity);
  const ph = t * s * TAU; // one cycle per second at speed 1

  switch (id) {
    case 'bounce': {
      const up = Math.abs(Math.sin(ph * 0.75));
      const squash = 1 - 0.18 * k * Math.pow(1 - up, 6);
      return {
        position: [0, up * 0.35 * height * k, 0],
        rotation: [0, 0, 0],
        scale: [1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash)],
      };
    }
    case 'hop': {
      const cycle = (t * s * 0.9) % 1;
      const air = cycle < 0.5 ? Math.sin(cycle * 2 * Math.PI) : 0;
      return {
        position: [0, air * 0.5 * height * k, 0],
        rotation: [-air * 0.25 * k, 0, 0],
        scale: [1, 1 + air * 0.08 * k, 1],
      };
    }
    case 'spin':
      return {
        position: [0, 0, 0],
        rotation: [0, ph * 0.5 * Math.max(k, 0.25), 0],
        scale: [1, 1, 1],
      };
    case 'wobble':
      return {
        position: [0, 0, 0],
        rotation: [Math.sin(ph * 0.5 + 1) * 0.06 * k, 0, Math.sin(ph * 0.75) * 0.28 * k],
        scale: [1, 1, 1],
      };
    case 'squash': {
      const a = Math.sin(ph * 0.75) * 0.22 * k;
      const sy = 1 + a;
      const sxz = 1 / Math.sqrt(sy);
      return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [sxz, sy, sxz] };
    }
    case 'float':
      return {
        position: [0, (0.12 + Math.sin(ph * 0.4) * 0.07) * height * k, 0],
        rotation: [
          Math.sin(ph * 0.3) * 0.04 * k,
          Math.sin(ph * 0.2) * 0.15 * k,
          Math.cos(ph * 0.35) * 0.05 * k,
        ],
        scale: [1, 1, 1],
      };
    case 'shake': {
      const jitter = Math.sin(ph * 9) * 0.02 * height * k;
      return {
        position: [jitter, 0, Math.cos(ph * 11) * 0.01 * height * k],
        rotation: [0, Math.sin(ph * 10) * 0.05 * k, Math.sin(ph * 13) * 0.04 * k],
        scale: [1, 1, 1],
      };
    }
  }
}
