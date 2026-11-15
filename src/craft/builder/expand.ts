import { CatmullRomCurve3, Vector3 } from 'three';
import { chainBoneName, mirrorBoneRef, mirrorId } from '../spec/mirror';
import { LIMITS, type Part, type ShapeSpec, type Vec3 } from '../spec/types';

export interface ExpandedBone {
  name: string;
  parent: string | null;
  head: Vec3;
}

/** How a tube is skinned when it carries a bone chain. */
export interface TubeChain {
  /** Chain bone names in order, tail_1 .. tail_n. */
  bones: string[];
}

export interface ExpandedSpec {
  bones: ExpandedBone[];
  parts: Part[];
  /** Keyed by part id. */
  chains: Map<string, TubeChain>;
  warnings: string[];
}

const NEAR_ZERO = 1e-6;

function mirrorVec(v: Vec3): Vec3 {
  return [-v[0], v[1], v[2]];
}

/** Section 5.3: create the _r copies of mirrored bones and parts. */
function mirrorPart(part: Part): Part | null {
  if (part.shape === 'tube') {
    if (part.points.every((p) => Math.abs(p[0]) < NEAR_ZERO)) return null;
  } else if (Math.abs(part.position[0]) < NEAR_ZERO) {
    return null;
  }
  const rotation = part.rotation ?? [0, 0, 0];
  const twin = {
    ...part,
    id: mirrorId(part.id),
    bone: mirrorBoneRef(part.bone),
    position: mirrorVec(part.position),
    rotation: [rotation[0], -rotation[1], -rotation[2]] as Vec3,
  } as Part;
  delete twin.mirror;
  if (twin.shape === 'tube') {
    twin.points = twin.points.map(mirrorVec);
    if (twin.boneChain) twin.boneChain = mirrorBoneRef(twin.boneChain);
  }
  return twin;
}

/** Put parents before children so skeleton indices are valid. */
function sortBones(bones: ExpandedBone[]): ExpandedBone[] {
  const byName = new Map(bones.map((b) => [b.name, b]));
  const out: ExpandedBone[] = [];
  const done = new Set<string>();
  const visit = (b: ExpandedBone) => {
    if (done.has(b.name)) return;
    done.add(b.name);
    const parent = b.parent ? byName.get(b.parent) : undefined;
    if (parent) visit(parent);
    out.push(b);
  };
  bones.forEach(visit);
  return out;
}

/** Mirrors, then bone chains, then caps the part count. */
export function expandSpec(spec: ShapeSpec): ExpandedSpec {
  const warnings: string[] = [];

  // ---- bones: mirror
  let bones: ExpandedBone[] = [];
  for (const b of spec.bones) {
    bones.push({ name: b.name, parent: b.parent, head: b.head });
    if (b.mirror) {
      if (Math.abs(b.head[0]) < NEAR_ZERO) {
        warnings.push(`Bone "${b.name}" is mirrored but sits at x = 0, so no twin was made.`);
        continue;
      }
      bones.push({
        name: mirrorId(b.name),
        parent: b.parent === null ? null : mirrorBoneRef(b.parent),
        head: mirrorVec(b.head),
      });
    }
  }

  // ---- parts: mirror
  const parts: Part[] = [];
  for (const p of spec.parts) {
    const { mirror, ...own } = p;
    parts.push({ ...own, ...(mirror ? { mirror } : {}) } as Part);
    if (mirror) {
      const twin = mirrorPart(p);
      if (twin) parts.push(twin);
      else warnings.push(`"${p.id}" is mirrored but sits at x = 0, so no copy was made.`);
    }
  }
  // the source part keeps its mirror flag only in the spec; expanded parts are plain
  for (const p of parts) delete p.mirror;

  // ---- tube bone chains
  const chains = new Map<string, TubeChain>();
  const existing = new Set(bones.map((b) => b.name));
  for (const p of parts) {
    if (p.shape !== 'tube' || !p.boneChain) continue;
    const n = Math.min(LIMITS.chainMax, Math.max(LIMITS.chainMin, p.chainLength ?? 4));
    const curve = new CatmullRomCurve3(
      p.points.map((q) => new Vector3(...q)),
      false,
      'centripetal',
    );
    const names: string[] = [];
    let parent = p.bone;
    for (let i = 1; i <= n; i++) {
      const name = chainBoneName(p.boneChain, i);
      names.push(name);
      if (!existing.has(name)) {
        const h = curve.getPointAt((i - 1) / n);
        bones.push({ name, parent, head: [h.x, h.y, h.z] });
        existing.add(name);
      }
      parent = name;
    }
    chains.set(p.id, { bones: names });
  }

  if (parts.length > LIMITS.partsMaxExpanded) {
    warnings.push(
      `More than ${LIMITS.partsMaxExpanded} parts after mirroring; the extras were dropped.`,
    );
    parts.length = LIMITS.partsMaxExpanded;
  }

  // drop bones whose parent is missing (should not happen after validation)
  const names = new Set(bones.map((b) => b.name));
  bones = bones.map((b) =>
    b.parent && !names.has(b.parent) ? { ...b, parent: bones[0]?.name ?? null } : b,
  );

  return { bones: sortBones(bones), parts, chains, warnings };
}
