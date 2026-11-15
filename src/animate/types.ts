import type { Object3D, Skeleton, SkinnedMesh } from 'three';
import type { MotionId } from '../rig/motions';
import type { RigBodyType } from '../rig/skeleton';

export type Vec3 = [number, number, number];

/** Animations that move bones. They need a skeleton. */
export type ClipId =
  | 'idle'
  | 'walk'
  | 'trot'
  | 'run'
  | 'jump'
  | 'sit'
  | 'lie_down'
  | 'stretch'
  | 'tail_wag'
  | 'look_around'
  | 'wave'
  | 'dance'
  | 'clap'
  | 'hop'
  | 'flap'
  | 'fly'
  | 'swim'
  | 'slither';

/** Every animation the app can play: bone clips, plus whole-model motions that work without a rig. */
export type AnimId = ClipId | MotionId;

export interface AnimParams {
  /** 0.25 to 3. 1 is the normal speed. */
  speed: number;
  /** 0 to 2. 1 is the normal size of movement. */
  intensity: number;
  /** Seconds to play for animations that loop. */
  duration?: number;
}

export interface Step {
  id: AnimId;
  params: AnimParams;
}

export const DEFAULT_PARAMS: AnimParams = { speed: 1, intensity: 1 };

/** What the animations act on: a skeleton plus the facts needed to adapt to its proportions. */
export interface AnimTarget {
  /** The object that contains the bones (the animation mixer's root). */
  root: Object3D;
  skeleton: Skeleton;
  bodyType: RigBodyType;
  /** Front and left directions in the model's space. Craft models use +z and +x. */
  frame: { front: Vec3; left: Vec3 };
  meshes: SkinnedMesh[];
}

/** A listing entry for the UI and the parser. */
export interface AnimEntry {
  id: AnimId;
  label: string;
  kind: 'clip' | 'motion';
  loop: boolean;
}
