/** Name for the right-hand twin of a left-hand id. `ear_l` becomes `ear_r`; others get `_r` added. */
export function mirrorId(id: string): string {
  return id.endsWith('_l') ? `${id.slice(0, -2)}_r` : `${id}_r`;
}

/** Bone reference for a mirrored part: `leg_l` becomes `leg_r`; bones without a side stay as they are. */
export function mirrorBoneRef(name: string): string {
  return name.endsWith('_l') ? `${name.slice(0, -2)}_r` : name;
}

/** Name of bone `i` (1-based) in a bone chain. */
export function chainBoneName(chain: string, i: number): string {
  return `${chain}_${i}`;
}
