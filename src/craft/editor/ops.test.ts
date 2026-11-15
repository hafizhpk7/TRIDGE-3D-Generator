import { describe, expect, it } from 'vitest';
import cat from '../fixtures/cat.json';
import { expandSpec } from '../builder/expand';
import { validateSpec } from '../spec/validate';
import type { ShapeSpec } from '../spec/types';
import {
  HISTORY_LIMIT,
  addPrimitive,
  deletePart,
  duplicatePart,
  emptyHistory,
  findPart,
  isMirrorTwin,
  pushHistory,
  redoHistory,
  rotatePart,
  scalePart,
  setPaletteColor,
  sourceIdFor,
  toggleMirror,
  translatePart,
  undoHistory,
  unlinkMirror,
  updateBoneHead,
  updatePart,
} from './ops';

const base = (): ShapeSpec => validateSpec(JSON.parse(JSON.stringify(cat))).spec!;

describe('selection', () => {
  it('maps a mirrored twin back to its source part', () => {
    const s = base();
    expect(sourceIdFor(s, 'ear_l')).toBe('ear_l');
    expect(sourceIdFor(s, 'ear_r')).toBe('ear_l');
    expect(isMirrorTwin(s, 'ear_r')).toBe(true);
    expect(isMirrorTwin(s, 'ear_l')).toBe(false);
    expect(sourceIdFor(s, 'unknown')).toBeNull();
  });
});

describe('part actions', () => {
  it('updates one part without touching the others', () => {
    const s = base();
    const next = updatePart(s, 'head', { color: 'cream' });
    expect(findPart(next, 'head')!.color).toBe('cream');
    expect(findPart(s, 'head')!.color).toBe('fur');
    expect(next.parts.length).toBe(s.parts.length);
  });

  it('editing the left ear changes the right ear too, because the twin is derived', () => {
    const s = updatePart(base(), 'ear_l', { position: [0.8, 2.9, 1.1] });
    const parts = expandSpec(s).parts;
    expect(parts.find((p) => p.id === 'ear_r')!.position[0]).toBeCloseTo(-0.8);
  });

  it('deletes a part but never the last one', () => {
    const s = base();
    expect(deletePart(s, 'nose').parts.some((p) => p.id === 'nose')).toBe(false);
    let tiny = { ...s, parts: [s.parts[0]] };
    tiny = deletePart(tiny, tiny.parts[0].id);
    expect(tiny.parts.length).toBe(1);
  });

  it('duplicates with a unique id and a small offset', () => {
    const s = base();
    const { spec, newId } = duplicatePart(s, 'ear_l');
    expect(newId).not.toBe('ear_l');
    expect(new Set(spec.parts.map((p) => p.id)).size).toBe(spec.parts.length);
    expect(findPart(spec, newId!)!.position[0]).toBeCloseTo(
      findPart(s, 'ear_l')!.position[0] + 0.2,
    );
    const again = duplicatePart(spec, 'ear_l');
    expect(again.newId).not.toBe(newId);
    expect(duplicatePart(s, 'missing').newId).toBeNull();
  });

  it('adds each primitive as a valid part', () => {
    for (const shape of [
      'sphere',
      'box',
      'cylinder',
      'cone',
      'capsule',
      'torus',
      'tube',
    ] as const) {
      const { spec, newId } = addPrimitive(base(), shape);
      expect(findPart(spec, newId)!.shape).toBe(shape);
      const v = validateSpec(JSON.parse(JSON.stringify(spec)));
      expect(v.ok, shape).toBe(true);
      expect(
        v.warnings.filter((w) => /dropped|unknown/.test(w)),
        shape,
      ).toEqual([]);
    }
  });

  it('toggles mirror on and off', () => {
    const s = base();
    const off = toggleMirror(s, 'ear_l');
    expect(findPart(off, 'ear_l')!.mirror).toBeUndefined();
    expect(expandSpec(off).parts.some((p) => p.id === 'ear_r')).toBe(false);
    const on = toggleMirror(off, 'ear_l');
    expect(findPart(on, 'ear_l')!.mirror).toBe('x');
  });

  it('unlinks a pair into two independent parts with the same final look', () => {
    const s = base();
    const before = expandSpec(s).parts.find((p) => p.id === 'ear_r')!;
    const unlinked = unlinkMirror(s, 'ear_l');
    expect(findPart(unlinked, 'ear_l')!.mirror).toBeUndefined();
    const right = findPart(unlinked, 'ear_r')!;
    expect(right.position).toEqual(before.position);
    expect(right.rotation).toEqual(before.rotation);
    expect(right.mirror).toBeUndefined();
    // now the right ear can move alone
    const moved = updatePart(unlinked, 'ear_r', { position: [-0.1, 2.5, 1.1] });
    expect(findPart(moved, 'ear_l')!.position[0]).toBeCloseTo(0.46);
  });

  it('changing a palette color recolors every part that uses it', () => {
    const s = setPaletteColor(base(), 'fur', '#112233');
    const furParts = s.parts.filter((p) => p.color === 'fur').length;
    expect(furParts).toBeGreaterThan(5);
    expect(s.palette.fur).toBe('#112233');
  });

  it('moves a bone head within limits', () => {
    const s = updateBoneHead(base(), 'head', [0, 99, 0]);
    expect(s.bones.find((b) => b.name === 'head')!.head[1]).toBe(10);
  });
});

describe('transform edits', () => {
  const sphere = findPart(base(), 'head')!;
  it('translate and rotate come from the snapshot', () => {
    expect(translatePart(sphere, [1, 2, 3]).position).toEqual([1, 2, 3]);
    expect(rotatePart(sphere, [10, 20, 400]).rotation).toEqual([10, 20, 360]);
  });
  it('translating a tube moves all of its points', () => {
    const tail = findPart(base(), 'tail')!;
    if (tail.shape !== 'tube') throw new Error('expected tube');
    const moved = translatePart(tail, [0, 1, 0]);
    if (moved.shape !== 'tube') throw new Error('expected tube');
    expect(moved.points[0][1]).toBeCloseTo(tail.points[0][1] + 1);
    expect(rotatePart(tail, [30, 0, 0])).toBe(tail);
  });
  it('scales each shape by per-axis factors and keeps sizes in range', () => {
    const s = scalePart(sphere, [2, 1, 0.5]);
    if (s.shape !== 'sphere' || sphere.shape !== 'sphere') throw new Error('expected sphere');
    expect(s.radii[0]).toBeCloseTo(sphere.radii[0] * 2);
    expect(s.radii[2]).toBeCloseTo(sphere.radii[2] * 0.5);
    const huge = scalePart(sphere, [1000, 1000, 1000]);
    if (huge.shape !== 'sphere') throw new Error('expected sphere');
    expect(huge.radii[0]).toBe(10);
    const tiny = scalePart(sphere, [0, 0, 0]);
    if (tiny.shape !== 'sphere') throw new Error('expected sphere');
    expect(tiny.radii[0]).toBeGreaterThanOrEqual(0.005);
    const cyl = findPart(base(), 'leg_front_l')!;
    const c = scalePart(cyl, [1, 2, 1]);
    if (c.shape !== 'cylinder' || cyl.shape !== 'cylinder') throw new Error('expected cylinder');
    expect(c.height).toBeCloseTo(cyl.height * 2);
    expect(c.radiusTop).toBeCloseTo(cyl.radiusTop);
  });
});

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 1); // moved from 1 to 2
    h = pushHistory(h, 2); // moved from 2 to 3
    const u1 = undoHistory(h, 3)!;
    expect(u1.value).toBe(2);
    const u2 = undoHistory(u1.history, u1.value)!;
    expect(u2.value).toBe(1);
    expect(undoHistory(u2.history, u2.value)).toBeNull();
    const r1 = redoHistory(u2.history, u2.value)!;
    expect(r1.value).toBe(2);
    expect(redoHistory(r1.history, r1.value)!.value).toBe(3);
  });

  it('a new edit clears the redo stack', () => {
    let h = pushHistory(emptyHistory<number>(), 1);
    const u = undoHistory(h, 2)!;
    expect(u.history.future).toEqual([2]);
    h = pushHistory(u.history, 1);
    expect(h.future).toEqual([]);
  });

  it('keeps at most 50 snapshots', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 80; i++) h = pushHistory(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    expect(h.past[0]).toBe(30);
  });
});
