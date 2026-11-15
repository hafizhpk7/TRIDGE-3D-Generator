import { z } from 'zod';
import { partBounds } from './bounds';
import { chainBoneName, mirrorBoneRef, mirrorId } from './mirror';
import {
  BODY_TYPES,
  FALLBACK_COLOR,
  LIMITS,
  SHAPES,
  type Bone,
  type BodyType,
  type Part,
  type ShapeSpec,
  type Vec3,
} from './types';

export interface ValidationResult {
  ok: boolean;
  spec?: ShapeSpec;
  /** Reasons the spec was rejected. Empty when ok. */
  errors: string[];
  /** Things that were fixed or clamped automatically. */
  warnings: string[];
}

// ---- structural schemas (zod). Values are clamped afterwards, so any finite number passes here ----

const num = z.number().finite();
const vec3 = z.tuple([num, num, num]);

const base = {
  id: z.string().optional(),
  position: vec3.default([0, 0, 0]),
  rotation: vec3.optional(),
  color: z.string().default(''),
  bone: z.string().default(''),
  mirror: z.literal('x').optional(),
  sides: num.optional(),
  detached: z.boolean().optional(),
};

const PartSchema = z.discriminatedUnion('shape', [
  z.object({ ...base, shape: z.literal('sphere'), radii: vec3 }),
  z.object({ ...base, shape: z.literal('box'), size: vec3, bevel: num.optional() }),
  z.object({
    ...base,
    shape: z.literal('cylinder'),
    radiusTop: num,
    radiusBottom: num,
    height: num,
  }),
  z.object({ ...base, shape: z.literal('cone'), radius: num, height: num }),
  z.object({ ...base, shape: z.literal('capsule'), radius: num, length: num }),
  z.object({ ...base, shape: z.literal('torus'), radius: num, tube: num, arc: num.optional() }),
  z.object({
    ...base,
    shape: z.literal('tube'),
    points: z.array(vec3),
    radiusStart: num,
    radiusEnd: num,
    boneChain: z.string().optional(),
    chainLength: num.optional(),
  }),
]);

const BoneSchema = z.object({
  name: z.string().min(1),
  parent: z.string().nullable().optional(),
  head: vec3,
  mirror: z.literal('x').optional(),
});

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (!HEX.test(v)) return null;
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  return v.toUpperCase();
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 2)
    .map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
    .join('; ');
}

/**
 * Check pasted or generated data against Shape Spec v1. Out-of-range values are clamped and reported
 * as warnings. Problems that make the model unusable come back as errors.
 */
export function validateSpec(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (): ValidationResult => ({ ok: false, errors, warnings });
  const warn = (m: string) => warnings.push(m);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('Expected a JSON object at the top level.');
    return fail();
  }
  const input = raw as Record<string, unknown>;

  if (input.version !== undefined && input.version !== 1) {
    warn(`Unknown version ${String(input.version)}; reading it as version 1.`);
  }
  const name =
    typeof input.name === 'string' && input.name.trim()
      ? input.name.trim().slice(0, 60)
      : 'Untitled';
  let bodyType: BodyType = 'object';
  if (
    typeof input.bodyType === 'string' &&
    (BODY_TYPES as readonly string[]).includes(input.bodyType)
  ) {
    bodyType = input.bodyType as BodyType;
  } else {
    warn(`bodyType is missing or unknown; using "object".`);
  }

  // ---- palette
  const palette: Record<string, string> = {};
  if (input.palette && typeof input.palette === 'object' && !Array.isArray(input.palette)) {
    for (const [key, value] of Object.entries(input.palette as Record<string, unknown>)) {
      if (Object.keys(palette).length >= LIMITS.paletteMax) {
        warn(`The palette has more than ${LIMITS.paletteMax} colors; the extras were dropped.`);
        break;
      }
      const hex = typeof value === 'string' ? normalizeHex(value) : null;
      if (hex) palette[key] = hex;
      else warn(`palette.${key}: "${String(value)}" is not a hex color, so it was dropped.`);
    }
  }

  const coord = (v: number, where: string): number => {
    const c = clamp(v, -LIMITS.coord, LIMITS.coord);
    if (c !== v) warn(`${where}: ${v} is outside ±${LIMITS.coord}, clamped to ${c}.`);
    return c;
  };
  const vec = (v: Vec3, where: string): Vec3 => [
    coord(v[0], where),
    coord(v[1], where),
    coord(v[2], where),
  ];
  const size = (v: number, where: string): number => {
    const c = clamp(v, LIMITS.sizeMin, LIMITS.sizeMax);
    if (c !== v)
      warn(`${where}: ${v} is outside ${LIMITS.sizeMin} to ${LIMITS.sizeMax}, clamped to ${c}.`);
    return c;
  };
  const sizeVec = (v: Vec3, where: string): Vec3 => [
    size(v[0], where),
    size(v[1], where),
    size(v[2], where),
  ];

  // ---- bones
  const bones: Bone[] = [];
  if (!Array.isArray(input.bones)) {
    errors.push('Missing "bones". There must be a root bone (parent null).');
  } else {
    const seen = new Set<string>();
    input.bones.forEach((b, i) => {
      if (bones.length >= LIMITS.bonesMax) return;
      const parsed = BoneSchema.safeParse(b);
      if (!parsed.success) {
        warn(`bones[${i}] was dropped: ${describeIssues(parsed.error)}`);
        return;
      }
      if (seen.has(parsed.data.name)) {
        warn(`bones[${i}]: duplicate bone "${parsed.data.name}" was dropped.`);
        return;
      }
      seen.add(parsed.data.name);
      bones.push({
        name: parsed.data.name,
        parent: parsed.data.parent ?? null,
        head: vec(parsed.data.head, `bones[${i}].head`),
        ...(parsed.data.mirror ? { mirror: 'x' as const } : {}),
      });
    });
    if (input.bones.length > LIMITS.bonesMax)
      warn(`More than ${LIMITS.bonesMax} bones; the extras were dropped.`);
  }

  if (bones.length > 0) {
    const roots = bones.filter((b) => b.parent === null);
    if (roots.length === 0) {
      errors.push('No root bone. One bone must have "parent": null (usually "root").');
    } else {
      const names = new Set(bones.map((b) => b.name));
      const rootName = roots[0].name;
      for (const b of bones) {
        if (b.parent === null && b.name !== rootName) {
          warn(`Bone "${b.name}" had no parent, so it was attached to "${rootName}".`);
          b.parent = rootName;
        } else if (b.parent !== null && !names.has(b.parent)) {
          warn(
            `Bone "${b.name}" names a parent "${b.parent}" that does not exist; attached to "${rootName}".`,
          );
          b.parent = rootName;
        }
      }
      // cycle check
      const parentOf = new Map(bones.map((b) => [b.name, b.parent]));
      for (const b of bones) {
        const visited = new Set<string>();
        let cur: string | null = b.name;
        while (cur !== null) {
          if (visited.has(cur)) {
            errors.push(
              `Bones form a loop through "${cur}". Each bone needs a path up to the root.`,
            );
            break;
          }
          visited.add(cur);
          cur = parentOf.get(cur) ?? null;
        }
        if (errors.length) break;
      }
    }
  }

  // ---- parts
  if (!Array.isArray(input.parts)) {
    errors.push('Missing "parts". The model needs a list of shapes.');
  }
  if (errors.length) return fail();

  const rawParts = input.parts as unknown[];
  if (rawParts.length > LIMITS.partsMax) {
    warn(`More than ${LIMITS.partsMax} parts; the extras were dropped.`);
  }

  // Names a part may use as its bone, including twins and chain bones created later.
  const knownBones = new Set<string>();
  for (const b of bones) {
    knownBones.add(b.name);
    if (b.mirror) knownBones.add(mirrorBoneRef(b.name));
  }
  const addChain = (chain: string, count: number) => {
    for (let i = 1; i <= count; i++) knownBones.add(chainBoneName(chain, i));
  };
  for (const p of rawParts) {
    const t = p as {
      shape?: unknown;
      boneChain?: unknown;
      chainLength?: unknown;
      mirror?: unknown;
    };
    if (t && t.shape === 'tube' && typeof t.boneChain === 'string' && t.boneChain) {
      const n = clamp(
        Math.round(typeof t.chainLength === 'number' ? t.chainLength : 4),
        LIMITS.chainMin,
        LIMITS.chainMax,
      );
      addChain(t.boneChain, n);
      if (t.mirror === 'x') addChain(mirrorBoneRef(t.boneChain), n);
    }
  }

  const nearestBone = (position: Vec3): string => {
    let best = bones[0].name;
    let bd = Infinity;
    for (const b of bones) {
      const d =
        (b.head[0] - position[0]) ** 2 +
        (b.head[1] - position[1]) ** 2 +
        (b.head[2] - position[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = b.name;
      }
    }
    return best;
  };

  const parts: Part[] = [];
  const ids = new Set<string>();
  rawParts.slice(0, LIMITS.partsMax).forEach((rp, i) => {
    const label = `parts[${i}]`;
    const shape = (rp as { shape?: unknown } | null)?.shape;
    if (typeof shape !== 'string' || !(SHAPES as string[]).includes(shape)) {
      warn(`${label}: unknown shape "${String(shape)}", so the part was dropped.`);
      return;
    }
    const parsed = PartSchema.safeParse(rp);
    if (!parsed.success) {
      warn(`${label} (${shape}) was dropped: ${describeIssues(parsed.error)}`);
      return;
    }
    const d = parsed.data;

    // id
    let id = d.id && d.id.trim() ? d.id.trim() : `part_${i + 1}`;
    if (ids.has(id)) {
      let n = 2;
      while (ids.has(`${id}_${n}`)) n++;
      warn(`${label}: duplicate id "${id}" renamed to "${id}_${n}".`);
      id = `${id}_${n}`;
    }
    ids.add(id);
    const where = `parts[${i}] "${id}"`;

    // color
    let color = d.color;
    if (palette[color] === undefined) {
      const hex = normalizeHex(color);
      if (hex) color = hex;
      else {
        warn(`${where}: color "${color}" is not in the palette, using gray.`);
        color = FALLBACK_COLOR;
      }
    }

    const common = {
      id,
      position: vec(d.position, `${where}.position`),
      ...(d.rotation
        ? { rotation: d.rotation.map((r) => clamp(r, -LIMITS.rotation, LIMITS.rotation)) as Vec3 }
        : { rotation: [0, 0, 0] as Vec3 }),
      color,
      bone: d.bone,
      ...(d.mirror ? { mirror: 'x' as const } : {}),
      ...(d.sides !== undefined
        ? { sides: clamp(Math.round(d.sides), LIMITS.sidesMin, LIMITS.sidesMax) }
        : {}),
      ...(d.detached ? { detached: true } : {}),
    };

    let part: Part;
    switch (d.shape) {
      case 'sphere':
        part = { ...common, shape: 'sphere', radii: sizeVec(d.radii, `${where}.radii`) };
        break;
      case 'box': {
        const bevel = d.bevel === undefined ? undefined : clamp(d.bevel, 0, LIMITS.bevelMax);
        part = {
          ...common,
          shape: 'box',
          size: sizeVec(d.size, `${where}.size`),
          ...(bevel ? { bevel } : {}),
        };
        break;
      }
      case 'cylinder':
        part = {
          ...common,
          shape: 'cylinder',
          radiusTop: size(d.radiusTop, `${where}.radiusTop`),
          radiusBottom: size(d.radiusBottom, `${where}.radiusBottom`),
          height: size(d.height, `${where}.height`),
        };
        break;
      case 'cone':
        part = {
          ...common,
          shape: 'cone',
          radius: size(d.radius, `${where}.radius`),
          height: size(d.height, `${where}.height`),
        };
        break;
      case 'capsule':
        part = {
          ...common,
          shape: 'capsule',
          radius: size(d.radius, `${where}.radius`),
          length: size(d.length, `${where}.length`),
        };
        break;
      case 'torus':
        part = {
          ...common,
          shape: 'torus',
          radius: size(d.radius, `${where}.radius`),
          tube: size(d.tube, `${where}.tube`),
          ...(d.arc !== undefined ? { arc: clamp(d.arc, 1, 360) } : {}),
        };
        break;
      case 'tube': {
        if (d.points.length < LIMITS.tubePointsMin) {
          warn(
            `${where}: a tube needs at least ${LIMITS.tubePointsMin} points, so it was dropped.`,
          );
          return;
        }
        let points = d.points;
        if (points.length > LIMITS.tubePointsMax) {
          warn(`${where}: more than ${LIMITS.tubePointsMax} points; the extras were dropped.`);
          points = points.slice(0, LIMITS.tubePointsMax);
        }
        part = {
          ...common,
          shape: 'tube',
          points: points.map((p, k) => vec(p, `${where}.points[${k}]`)),
          radiusStart: size(d.radiusStart, `${where}.radiusStart`),
          radiusEnd: size(d.radiusEnd, `${where}.radiusEnd`),
          ...(d.boneChain ? { boneChain: d.boneChain } : {}),
          ...(d.boneChain
            ? {
                chainLength: clamp(
                  Math.round(d.chainLength ?? 4),
                  LIMITS.chainMin,
                  LIMITS.chainMax,
                ),
              }
            : {}),
        };
        break;
      }
    }

    // bone
    if (!knownBones.has(part.bone)) {
      const near = nearestBone(part.position);
      warn(
        part.bone
          ? `${where}: bone "${part.bone}" does not exist, using the nearest bone "${near}".`
          : `${where}: no bone given, using the nearest bone "${near}".`,
      );
      part = { ...part, bone: near };
    }
    parts.push(part);
  });

  if (parts.length === 0) {
    errors.push('No valid parts. Every part was missing something or used an unknown shape.');
    return fail();
  }

  // mirrored parts need an x offset to be useful
  for (const p of parts) {
    if (p.mirror && p.shape !== 'tube' && Math.abs(p.position[0]) < 1e-6) {
      warn(`"${p.id}" is mirrored but sits at x = 0, so no copy will be made.`);
    }
  }

  // stand on the ground
  let minY = Infinity;
  for (const p of parts) minY = Math.min(minY, partBounds(p).min[1]);
  if (Number.isFinite(minY) && Math.abs(minY) > 0.02) {
    warn(
      `Moved the model ${minY > 0 ? 'down' : 'up'} by ${Math.abs(minY).toFixed(2)} so it stands on the ground.`,
    );
    for (const p of parts) {
      p.position = [p.position[0], p.position[1] - minY, p.position[2]];
      if (p.shape === 'tube') p.points = p.points.map((q) => [q[0], q[1] - minY, q[2]] as Vec3);
    }
    for (const b of bones) b.head = [b.head[0], b.head[1] - minY, b.head[2]];
  }

  const spec: ShapeSpec = {
    version: 1,
    name,
    bodyType,
    palette,
    bones,
    parts,
    ...(typeof input.notes === 'string' ? { notes: input.notes.slice(0, 500) } : {}),
  };
  return { ok: true, spec, errors: [], warnings };
}

export { mirrorId };
