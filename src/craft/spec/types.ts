/** Shape Spec v1. See docs/TRIDGE_CRAFT_SPEC.md section 4. */

export type Vec3 = [number, number, number];
/** A palette key ("fur") or a hex color ("#FF9F43"). */
export type ColorRef = string;

export const BODY_TYPES = ['quadruped', 'biped', 'bird', 'fish', 'snake', 'object'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export interface Bone {
  /** Follows the naming convention in section 6. */
  name: string;
  /** Exactly one bone has parent null (usually "root"). */
  parent: string | null;
  /** Joint position in model space. */
  head: Vec3;
  /** Create the _r twin automatically. */
  mirror?: 'x';
}

export interface PartBase {
  /** Unique, for example "ear_l". */
  id: string;
  position: Vec3;
  /** Degrees, XYZ order. Default [0, 0, 0]. */
  rotation?: Vec3;
  color: ColorRef;
  /** The bone this part moves with. */
  bone: string;
  /** Duplicate across X. The id and bone get _l replaced by _r. */
  mirror?: 'x';
  /** Override radial segments (3 to 32). */
  sides?: number;
  /** Template code only: marks a tiny decorative part that may float free. Ignored by the builder. */
  detached?: boolean;
}

export type SpherePart = PartBase & { shape: 'sphere'; radii: Vec3 };
export type BoxPart = PartBase & { shape: 'box'; size: Vec3; bevel?: number };
export type CylinderPart = PartBase & {
  shape: 'cylinder';
  radiusTop: number;
  radiusBottom: number;
  height: number;
};
export type ConePart = PartBase & { shape: 'cone'; radius: number; height: number };
export type CapsulePart = PartBase & { shape: 'capsule'; radius: number; length: number };
export type TorusPart = PartBase & { shape: 'torus'; radius: number; tube: number; arc?: number };
export type TubePart = PartBase & {
  shape: 'tube';
  /** 2 to 12 points, model space. */
  points: Vec3[];
  radiusStart: number;
  radiusEnd: number;
  /** For example "tail": creates tail_1 .. tail_n along the tube. `bone` is the parent of the first. */
  boneChain?: string;
  /** Number of chain bones, 2 to 8. Default 4. */
  chainLength?: number;
};

export type Part =
  SpherePart | BoxPart | CylinderPart | ConePart | CapsulePart | TorusPart | TubePart;

export type ShapeName = Part['shape'];
export const SHAPES: ShapeName[] = [
  'sphere',
  'box',
  'cylinder',
  'cone',
  'capsule',
  'torus',
  'tube',
];

export interface ShapeSpec {
  version: 1;
  name: string;
  bodyType: BodyType;
  /** Key to hex color, at most 16 entries. */
  palette: Record<string, string>;
  /** At most 64. */
  bones: Bone[];
  /** At most 150 before mirroring, 300 after. */
  parts: Part[];
  /** Free text from the author, ignored by the builder. */
  notes?: string;
}

/** Limits from section 4.2. */
export const LIMITS = {
  coord: 10,
  sizeMin: 0.005,
  sizeMax: 10,
  rotation: 360,
  sidesMin: 3,
  sidesMax: 32,
  bevelMax: 0.5,
  tubePointsMin: 2,
  tubePointsMax: 12,
  paletteMax: 16,
  partsMax: 150,
  partsMaxExpanded: 300,
  bonesMax: 64,
  chainMin: 2,
  chainMax: 8,
} as const;

export const FALLBACK_COLOR = '#B0B0C0';
