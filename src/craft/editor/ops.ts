import { mirrorId } from '../spec/mirror';
import {
  LIMITS,
  type Bone,
  type Part,
  type ShapeName,
  type ShapeSpec,
  type Vec3,
} from '../spec/types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (n: number) => Math.round(n * 1000) / 1000;
const coord = (v: Vec3): Vec3 => v.map((n) => clamp(r2(n), -LIMITS.coord, LIMITS.coord)) as Vec3;
const size = (n: number) => clamp(r2(n), LIMITS.sizeMin, LIMITS.sizeMax);

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function findPart(spec: ShapeSpec, id: string): Part | undefined {
  return spec.parts.find((p) => p.id === id);
}

/**
 * The id of the part that really exists in the spec. Clicking the right ear (`ear_r`) selects its
 * source `ear_l`, because the twin is generated from it.
 */
export function sourceIdFor(spec: ShapeSpec, id: string): string | null {
  if (findPart(spec, id)) return id;
  for (const p of spec.parts) if (p.mirror && mirrorId(p.id) === id) return p.id;
  return null;
}

export function isMirrorTwin(spec: ShapeSpec, id: string): boolean {
  return !findPart(spec, id) && sourceIdFor(spec, id) !== null;
}

export function updatePart(spec: ShapeSpec, id: string, patch: Partial<Part>): ShapeSpec {
  return {
    ...spec,
    parts: spec.parts.map((p) => (p.id === id ? ({ ...p, ...patch } as Part) : p)),
  };
}

export function deletePart(spec: ShapeSpec, id: string): ShapeSpec {
  if (spec.parts.length <= 1) return spec; // a model needs at least one part
  return { ...spec, parts: spec.parts.filter((p) => p.id !== id) };
}

function uniqueId(spec: ShapeSpec, base: string): string {
  const ids = new Set(spec.parts.map((p) => p.id));
  let n = 2;
  let id = `${base}_${n}`;
  while (ids.has(id)) id = `${base}_${++n}`;
  return id;
}

/** Copy a part, nudged sideways so the copy can be seen and grabbed. */
export function duplicatePart(
  spec: ShapeSpec,
  id: string,
): { spec: ShapeSpec; newId: string | null } {
  const part = findPart(spec, id);
  if (!part) return { spec, newId: null };
  const copy = clone(part);
  copy.id = uniqueId(
    spec,
    id.replace(/_l$/, '').replace(/_\d+$/, '') + (id.endsWith('_l') ? '_l' : ''),
  );
  const shift: Vec3 = [0.2, 0.1, 0];
  copy.position = coord([
    copy.position[0] + shift[0],
    copy.position[1] + shift[1],
    copy.position[2] + shift[2],
  ]);
  if (copy.shape === 'tube')
    copy.points = copy.points.map((p) => coord([p[0] + shift[0], p[1] + shift[1], p[2]]));
  return { spec: { ...spec, parts: [...spec.parts, copy] }, newId: copy.id };
}

const DEFAULTS: Record<ShapeName, (base: Omit<Part, 'shape'>) => Part> = {
  sphere: (b) => ({ ...b, shape: 'sphere', radii: [0.3, 0.3, 0.3] }) as Part,
  box: (b) => ({ ...b, shape: 'box', size: [0.5, 0.5, 0.5] }) as Part,
  cylinder: (b) =>
    ({ ...b, shape: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 0.6 }) as Part,
  cone: (b) => ({ ...b, shape: 'cone', radius: 0.25, height: 0.5, sides: 4 }) as Part,
  capsule: (b) => ({ ...b, shape: 'capsule', radius: 0.18, length: 0.5 }) as Part,
  torus: (b) => ({ ...b, shape: 'torus', radius: 0.3, tube: 0.08 }) as Part,
  tube: (b) =>
    ({
      ...b,
      shape: 'tube',
      points: [
        [0, 0.8, 0],
        [0, 1.1, 0.2],
        [0, 1.4, 0.2],
      ],
      radiusStart: 0.14,
      radiusEnd: 0.08,
    }) as Part,
};

/** Add a primitive near the middle of the model, attached to the root bone's nearest child. */
export function addPrimitive(
  spec: ShapeSpec,
  shape: ShapeName,
): { spec: ShapeSpec; newId: string } {
  const ids = new Set(spec.parts.map((p) => p.id));
  let n = 1;
  while (ids.has(`${shape}_${n}`)) n++;
  const id = `${shape}_${n}`;
  const key = Object.keys(spec.palette)[0] ?? '#B0B0C0';
  const root = spec.bones.find((b) => b.parent === null);
  const body = spec.bones.find((b) => b.parent === root?.name) ?? root;
  const part = DEFAULTS[shape]({
    id,
    position: [0, Math.max(0.5, body?.head[1] ?? 1), 0],
    rotation: [0, 0, 0],
    color: key,
    bone: body?.name ?? 'root',
  });
  return { spec: { ...spec, parts: [...spec.parts, part] }, newId: id };
}

export function toggleMirror(spec: ShapeSpec, id: string): ShapeSpec {
  const part = findPart(spec, id);
  if (!part) return spec;
  if (part.mirror) {
    const { mirror: _removed, ...rest } = part;
    void _removed;
    return updatePart(
      { ...spec, parts: spec.parts.map((p) => (p.id === id ? (rest as Part) : p)) },
      id,
      {},
    );
  }
  return updatePart(spec, id, { mirror: 'x' });
}

/**
 * Turn a mirrored pair into two independent parts, so the right one can be edited on its own.
 * The right copy gets the same mirrored transform the builder would have made.
 */
export function unlinkMirror(spec: ShapeSpec, id: string): ShapeSpec {
  const part = findPart(spec, id);
  if (!part || !part.mirror) return spec;
  const twinId = mirrorId(part.id);
  if (findPart(spec, twinId)) return toggleMirror(spec, id);
  const rotation = part.rotation ?? [0, 0, 0];
  const twin = clone(part);
  twin.id = twinId;
  twin.bone = part.bone.endsWith('_l') ? `${part.bone.slice(0, -2)}_r` : part.bone;
  twin.position = [-part.position[0], part.position[1], part.position[2]];
  twin.rotation = [rotation[0], -rotation[1], -rotation[2]];
  delete twin.mirror;
  if (twin.shape === 'tube') twin.points = twin.points.map((p) => [-p[0], p[1], p[2]] as Vec3);
  const without = toggleMirror(spec, id);
  return { ...without, parts: [...without.parts, twin] };
}

export function setPaletteColor(spec: ShapeSpec, key: string, hex: string): ShapeSpec {
  return { ...spec, palette: { ...spec.palette, [key]: hex } };
}

export function updateBoneHead(spec: ShapeSpec, name: string, head: Vec3): ShapeSpec {
  return {
    ...spec,
    bones: spec.bones.map((b): Bone => (b.name === name ? { ...b, head: coord(head) } : b)),
  };
}

// ---- transform edits, always computed from a snapshot so dragging never accumulates error ----------

export function translatePart(start: Part, position: Vec3): Part {
  const next = clone(start);
  const target = coord(position);
  if (next.shape === 'tube' && start.shape === 'tube') {
    const delta: Vec3 = [
      target[0] - start.position[0],
      target[1] - start.position[1],
      target[2] - start.position[2],
    ];
    next.points = start.points.map((p) =>
      coord([p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]]),
    );
  }
  next.position = target;
  return next;
}

export function rotatePart(start: Part, rotation: Vec3): Part {
  if (start.shape === 'tube') return start;
  return {
    ...clone(start),
    rotation: rotation.map((r) => clamp(r2(r), -LIMITS.rotation, LIMITS.rotation)) as Vec3,
  };
}

/** Scale a part's own dimensions by per-axis factors (tubes are not scalable). */
export function scalePart(start: Part, s: Vec3): Part {
  const [sx, sy, sz] = s.map((v) => Math.max(0.01, v));
  const radial = (sx + sz) / 2;
  const p = clone(start);
  switch (p.shape) {
    case 'sphere':
      p.radii = [size(p.radii[0] * sx), size(p.radii[1] * sy), size(p.radii[2] * sz)];
      break;
    case 'box':
      p.size = [size(p.size[0] * sx), size(p.size[1] * sy), size(p.size[2] * sz)];
      break;
    case 'cylinder':
      p.radiusTop = size(p.radiusTop * radial);
      p.radiusBottom = size(p.radiusBottom * radial);
      p.height = size(p.height * sy);
      break;
    case 'cone':
      p.radius = size(p.radius * radial);
      p.height = size(p.height * sy);
      break;
    case 'capsule':
      p.radius = size(p.radius * radial);
      p.length = size(p.length * sy);
      break;
    case 'torus':
      p.radius = size(p.radius * ((sx + sy) / 2));
      p.tube = size(p.tube * sz);
      break;
    case 'tube':
      break;
  }
  return p;
}

// ---- undo / redo ---------------------------------------------------------------------------------

export const HISTORY_LIMIT = 50;

export interface History<T> {
  past: T[];
  future: T[];
}

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** Record `current` before moving to a new state. */
export function pushHistory<T>(h: History<T>, current: T): History<T> {
  return { past: [...h.past, current].slice(-HISTORY_LIMIT), future: [] };
}

export function undoHistory<T>(
  h: History<T>,
  current: T,
): { history: History<T>; value: T } | null {
  const value = h.past.at(-1);
  if (value === undefined) return null;
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future] }, value };
}

export function redoHistory<T>(
  h: History<T>,
  current: T,
): { history: History<T>; value: T } | null {
  const value = h.future[0];
  if (value === undefined) return null;
  return {
    history: { past: [...h.past, current].slice(-HISTORY_LIMIT), future: h.future.slice(1) },
    value,
  };
}
