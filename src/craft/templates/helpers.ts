import type {
  BodyType,
  Bone,
  CapsulePart,
  ConePart,
  CylinderPart,
  Part,
  ShapeSpec,
  SpherePart,
  BoxPart,
  TorusPart,
  TubePart,
  Vec3,
} from '../spec/types';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export type ParamDef =
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number }
  | { key: string; label: string; type: 'color' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'toggle' };

export interface Template {
  id: string;
  name: string;
  bodyType: BodyType;
  params: ParamDef[];
  defaults: Params;
  /** Pure and deterministic. */
  build(params: Params): ShapeSpec;
}

/** TRIDGE palette, used for default colors. */
export const COLORS = {
  pink: '#FF6B9D',
  orange: '#FF9F43',
  yellow: '#FFD43B',
  mint: '#3DD9B0',
  sky: '#4DABF7',
  violet: '#9B7BFF',
  ink: '#22184A',
  cream: '#FFF3E0',
  white: '#FFFFFF',
  skin: '#FFCBA4',
  brown: '#8A5A3C',
  gray: '#B0B0C0',
};

// ---- reading parameters, falling back to defaults ----------------------------------------------

export function reader(defaults: Params, params: Params) {
  const get = (key: string) => (params[key] !== undefined ? params[key] : defaults[key]);
  return {
    num: (key: string) => Number(get(key)),
    str: (key: string) => String(get(key)),
    bool: (key: string) => Boolean(get(key)),
  };
}

// ---- part constructors -------------------------------------------------------------------------

type Extra = { rotation?: Vec3; mirror?: boolean; sides?: number; detached?: boolean };

function common(id: string, position: Vec3, color: string, bone: string, extra: Extra = {}) {
  return {
    id,
    position,
    color,
    bone,
    ...(extra.rotation ? { rotation: extra.rotation } : {}),
    ...(extra.mirror ? { mirror: 'x' as const } : {}),
    ...(extra.sides ? { sides: extra.sides } : {}),
    ...(extra.detached ? { detached: true } : {}),
  };
}

export const sphere = (
  id: string,
  position: Vec3,
  radii: Vec3,
  color: string,
  bone: string,
  extra?: Extra,
): SpherePart => ({ ...common(id, position, color, bone, extra), shape: 'sphere', radii });

export const box = (
  id: string,
  position: Vec3,
  size: Vec3,
  color: string,
  bone: string,
  extra?: Extra & { bevel?: number },
): BoxPart => ({
  ...common(id, position, color, bone, extra),
  shape: 'box',
  size,
  ...(extra?.bevel ? { bevel: extra.bevel } : {}),
});

export const cylinder = (
  id: string,
  position: Vec3,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: string,
  bone: string,
  extra?: Extra,
): CylinderPart => ({
  ...common(id, position, color, bone, extra),
  shape: 'cylinder',
  radiusTop,
  radiusBottom,
  height,
});

export const cone = (
  id: string,
  position: Vec3,
  radius: number,
  height: number,
  color: string,
  bone: string,
  extra?: Extra,
): ConePart => ({ ...common(id, position, color, bone, extra), shape: 'cone', radius, height });

export const capsule = (
  id: string,
  position: Vec3,
  radius: number,
  length: number,
  color: string,
  bone: string,
  extra?: Extra,
): CapsulePart => ({
  ...common(id, position, color, bone, extra),
  shape: 'capsule',
  radius,
  length,
});

export const torus = (
  id: string,
  position: Vec3,
  radius: number,
  tube: number,
  color: string,
  bone: string,
  extra?: Extra & { arc?: number },
): TorusPart => ({
  ...common(id, position, color, bone, extra),
  shape: 'torus',
  radius,
  tube,
  ...(extra?.arc ? { arc: extra.arc } : {}),
});

export const tube = (
  id: string,
  points: Vec3[],
  radiusStart: number,
  radiusEnd: number,
  color: string,
  bone: string,
  chain?: { name: string; length: number },
): TubePart => ({
  ...common(id, [0, 0, 0], color, bone),
  shape: 'tube',
  points,
  radiusStart,
  radiusEnd,
  ...(chain ? { boneChain: chain.name, chainLength: chain.length } : {}),
});

export const bone = (name: string, parent: string | null, head: Vec3, mirror = false): Bone => ({
  name,
  parent,
  head,
  ...(mirror ? { mirror: 'x' as const } : {}),
});

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Keep coordinates tidy and inside the allowed range. */
export function tidy<T extends Vec3>(v: T): T {
  return v.map((n) => Math.max(-10, Math.min(10, round2(n)))) as T;
}

export function makeSpec(
  name: string,
  bodyType: BodyType,
  palette: Record<string, string>,
  bones: Bone[],
  parts: Part[],
): ShapeSpec {
  return { version: 1, name, bodyType, palette, bones, parts };
}
