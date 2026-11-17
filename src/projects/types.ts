import type { SeqStep, PoseSnapshot } from '../animate/player';
import type { ShapeSpec } from '../craft/spec/types';
import type { Facing } from '../rig/frame';
import type { Vec3 } from '../rig/frame';
import type { RigBodyType } from '../rig/skeleton';
import type { LowPolySettings, Rgb } from '../pipeline/lowpoly/types';

/** Raw bytes with their media type. Stored this way so projects survive any storage layer and zip file. */
export interface Packed {
  type: string;
  bytes: ArrayBuffer;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  kind: 'model' | 'craft';
  /** Approximate bytes this project takes up. */
  bytes: number;
  /** Small picture for the gallery. */
  thumb?: Packed;
}

export interface SavedRig {
  bodyType: RigBodyType;
  facing: Facing;
  joints: Record<string, Vec3>;
  mirror: boolean;
  /** True when the skeleton was built (not just placed). */
  rigged: boolean;
  /** Which look of the model the rig was made from. */
  variant: 'original' | 'lowpoly' | null;
}

export interface SavedAnim {
  steps: SeqStep[];
  speed: number;
  loop: boolean;
  poses: { name: string; pose: PoseSnapshot }[];
}

export interface SavedLowPoly {
  settings: LowPolySettings;
  palette: Rgb[] | null;
  view: 'original' | 'lowpoly' | 'split';
}

export interface ProjectData {
  id: string;
  /** Which workspace step was open. */
  step: string;
  modelName: string;
  /** The original model as a GLB. Absent for Craft projects, which are rebuilt from their spec. */
  model?: Packed;
  craft?: { spec: ShapeSpec; detail: number; softJoints: boolean };
  /** The picture the model was made from. */
  image?: { packed: Packed; backgroundRemoved: boolean };
  lowpoly?: SavedLowPoly;
  rig?: SavedRig;
  anim?: SavedAnim;
}

export interface Project {
  meta: ProjectMeta;
  data: ProjectData;
}
