export type RigBodyType = 'quadruped' | 'biped' | 'bird' | 'fish' | 'snake' | 'object';

export const RIG_BODY_TYPES: { id: RigBodyType; label: string; hint: string }[] = [
  { id: 'quadruped', label: 'Quadruped', hint: 'Cat, dog, horse' },
  { id: 'biped', label: 'Biped', hint: 'Person, robot, standing bear' },
  { id: 'bird', label: 'Bird', hint: 'Wings, two legs, a tail' },
  { id: 'fish', label: 'Fish', hint: 'Swims with its tail' },
  { id: 'snake', label: 'Snake', hint: 'A chain of segments' },
  { id: 'object', label: 'Object', hint: 'Whole-model motion only' },
];

export interface JointDef {
  name: string;
  parent: string | null;
}

const chain = (prefix: string, parent: string, count: number): JointDef[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `${prefix}_${i + 1}`,
    parent: i === 0 ? parent : `${prefix}_${i}`,
  }));

export const SNAKE_SEGMENTS = 6;

/**
 * Skeleton templates. Names match the Craft bone convention (spec section 6), so one animation
 * library serves both rigged and Craft models.
 */
export const SKELETONS: Record<RigBodyType, JointDef[]> = {
  quadruped: [
    { name: 'root', parent: null },
    { name: 'hips', parent: 'root' },
    { name: 'spine', parent: 'hips' },
    { name: 'chest', parent: 'spine' },
    { name: 'neck', parent: 'chest' },
    { name: 'head', parent: 'neck' },
    { name: 'leg_front_l', parent: 'chest' },
    { name: 'leg_front_r', parent: 'chest' },
    { name: 'leg_back_l', parent: 'hips' },
    { name: 'leg_back_r', parent: 'hips' },
    ...chain('tail', 'hips', 3),
  ],
  biped: [
    { name: 'root', parent: null },
    { name: 'hips', parent: 'root' },
    { name: 'spine', parent: 'hips' },
    { name: 'chest', parent: 'spine' },
    { name: 'neck', parent: 'chest' },
    { name: 'head', parent: 'neck' },
    { name: 'arm_l', parent: 'chest' },
    { name: 'arm_r', parent: 'chest' },
    { name: 'leg_l', parent: 'hips' },
    { name: 'leg_r', parent: 'hips' },
  ],
  bird: [
    { name: 'root', parent: null },
    { name: 'body', parent: 'root' },
    { name: 'head', parent: 'body' },
    { name: 'wing_l', parent: 'body' },
    { name: 'wing_r', parent: 'body' },
    { name: 'leg_l', parent: 'body' },
    { name: 'leg_r', parent: 'body' },
    ...chain('tail', 'body', 3),
  ],
  fish: [
    { name: 'root', parent: null },
    { name: 'body', parent: 'root' },
    { name: 'head', parent: 'body' },
    ...chain('tail', 'body', 3),
    { name: 'fin_l', parent: 'body' },
    { name: 'fin_r', parent: 'body' },
    { name: 'fin_top', parent: 'body' },
  ],
  snake: [
    { name: 'root', parent: null },
    ...chain('segment', 'root', SNAKE_SEGMENTS),
    { name: 'head', parent: `segment_${SNAKE_SEGMENTS}` },
  ],
  object: [{ name: 'root', parent: null }],
};

/** Children of each bone, in template order. */
export function childrenOf(joints: JointDef[]): Map<string, string[]> {
  const out = new Map<string, string[]>(joints.map((j) => [j.name, []]));
  for (const j of joints) if (j.parent) out.get(j.parent)?.push(j.name);
  return out;
}

/** A pleasant marker color per region, so the skeleton reads at a glance. */
export function jointColor(name: string): number {
  if (name === 'root') return 0xffffff;
  if (/^(head|neck)/.test(name)) return 0xff6b9d;
  if (/^(leg|foot)/.test(name)) return 0x3dd9b0;
  if (/^(arm|wing|fin)/.test(name)) return 0x4dabf7;
  if (/^(tail|segment)/.test(name)) return 0xff9f43;
  return 0xffd43b; // spine, hips, chest, body
}
