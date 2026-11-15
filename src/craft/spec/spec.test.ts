import { describe, expect, it } from 'vitest';
import cat from '../fixtures/cat.json';
import penguin from '../fixtures/penguin.json';
import fenced from '../fixtures/broken/fenced-with-intro.txt?raw';
import truncated from '../fixtures/broken/truncated.txt?raw';
import notJson from '../fixtures/broken/not-json.txt?raw';
import badSyntax from '../fixtures/broken/bad-syntax.txt?raw';
import { repairAndParse, extractObject, stripFences } from './repair';
import { validateSpec } from './validate';
import { mirrorBoneRef, mirrorId } from './mirror';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('repair', () => {
  it('strips code fences', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('```\n{"a":1}')).toBe('{"a":1}');
  });

  it('extracts the first balanced object and ignores braces in strings', () => {
    const r = extractObject('intro {"a":"}{","b":{"c":1}} outro {"x":1}');
    expect(r).toEqual({ json: '{"a":"}{","b":{"c":1}}' });
  });

  it('reports a cut-off answer', () => {
    const r = repairAndParse(truncated);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/cut off/);
  });

  it('parses fenced output with intro text, comments, single quotes and trailing commas', () => {
    const r = repairAndParse(fenced);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { name: string }).name).toBe('Mini');
      expect(r.notes.length).toBeGreaterThan(0);
      expect(validateSpec(r.value).ok).toBe(true);
    }
  });

  it('gives a clean error when there is no JSON', () => {
    const r = repairAndParse(notJson);
    expect(r.ok).toBe(false);
  });

  it('gives line and column for broken syntax', () => {
    const r = repairAndParse(badSyntax);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBeGreaterThan(0);
  });

  it('refuses empty input', () => {
    expect(repairAndParse('   ').ok).toBe(false);
  });

  it('never runs code in pasted text', () => {
    const g = globalThis as unknown as { __pwned?: boolean };
    const r = repairAndParse('{"name": (globalThis.__pwned = true)}');
    expect(r.ok).toBe(false);
    expect(g.__pwned).toBeUndefined();
  });
});

describe('mirror names', () => {
  it('swaps only the suffix', () => {
    expect(mirrorId('ear_l')).toBe('ear_r');
    expect(mirrorId('left_ear_l')).toBe('left_ear_r');
    expect(mirrorId('eye')).toBe('eye_r');
    expect(mirrorBoneRef('leg_l')).toBe('leg_r');
    expect(mirrorBoneRef('head')).toBe('head');
  });
});

describe('validateSpec', () => {
  it('accepts the cat and penguin fixtures', () => {
    for (const f of [cat, penguin]) {
      const r = validateSpec(clone(f));
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
      // The fixtures are written the way Claude would write them, so nothing should be dropped.
      expect(r.warnings.filter((w) => /dropped|unknown/.test(w))).toEqual([]);
      expect(r.spec!.parts).toHaveLength(f.parts.length);
    }
    const tail = validateSpec(clone(cat)).spec!.parts.find((p) => p.id === 'tail')!;
    expect(tail.shape).toBe('tube');
    expect(tail.position).toEqual([0, 0, 0]);
  });

  it('hard-fails on missing parts, no parts, no root, and bone cycles', () => {
    const noParts = clone(cat) as Record<string, unknown>;
    delete noParts.parts;
    expect(validateSpec(noParts).ok).toBe(false);

    const empty = clone(cat);
    (empty as { parts: unknown[] }).parts = [{ shape: 'blob' }];
    const r = validateSpec(empty);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/No valid parts/);

    const noRoot = clone(cat);
    noRoot.bones[0].parent = 'hips' as never;
    expect(validateSpec(noRoot).errors.join(' ')).toMatch(/root bone/);

    const cycle = clone(cat);
    cycle.bones[1].parent = 'spine' as never;
    cycle.bones[2].parent = 'hips' as never;
    expect(validateSpec(cycle).errors.join(' ')).toMatch(/loop/);

    expect(validateSpec([]).ok).toBe(false);
    expect(validateSpec(null).ok).toBe(false);
  });

  it('clamps out-of-range values and warns', () => {
    const s = clone(cat);
    s.parts[0].position = [50, 1.25, 0] as never;
    (s.parts[0] as { radii: number[] }).radii = [0.0001, 99, 1];
    (s.parts[14] as { sides: number }).sides = 99;
    (s.parts[14] as { rotation: number[] }).rotation = [0, 0, 1000];
    const r = validateSpec(s);
    expect(r.ok).toBe(true);
    const body = r.spec!.parts.find((p) => p.id === 'body')!;
    expect(body.position[0]).toBeLessThanOrEqual(10);
    expect((body as { radii: number[] }).radii[0]).toBeGreaterThanOrEqual(0.005);
    expect((body as { radii: number[] }).radii[1]).toBeLessThanOrEqual(10);
    const ear = r.spec!.parts.find((p) => p.id === 'ear_l')!;
    expect(ear.sides).toBe(32);
    expect(ear.rotation![2]).toBe(360);
    expect(r.warnings.length).toBeGreaterThan(3);
  });

  it('soft-fixes unknown colors, bones, duplicate ids and unknown shapes', () => {
    const s = clone(cat);
    s.parts[1].color = 'neon';
    s.parts[2].bone = 'does_not_exist';
    s.parts[3].id = 'stripe_1';
    (s.parts as unknown[]).push({ id: 'x', shape: 'pyramid' });
    const r = validateSpec(s);
    expect(r.ok).toBe(true);
    const spec = r.spec!;
    expect(spec.parts.find((p) => p.id === 'chest')!.color).toBe('#B0B0C0');
    expect(spec.parts.find((p) => p.id === 'stripe_1')!.bone).not.toBe('does_not_exist');
    expect(new Set(spec.parts.map((p) => p.id)).size).toBe(spec.parts.length);
    expect(spec.parts.some((p) => p.id === 'stripe_1_2')).toBe(true);
    expect(spec.parts.some((p) => p.id === 'x')).toBe(false);
    expect(r.warnings.some((w) => /unknown shape/.test(w))).toBe(true);
  });

  it('picks the nearest bone for an unknown bone', () => {
    const s = clone(cat);
    s.parts[10].bone = 'nope'; // head part near the head bone
    const r = validateSpec(s);
    expect(r.spec!.parts.find((p) => p.id === 'head')!.bone).toBe('head');
  });

  it('accepts chain bone names that only exist after expansion', () => {
    const s = clone(cat);
    (s.parts as unknown[]).push({
      id: 'tail_tip',
      shape: 'sphere',
      radii: [0.1, 0.1, 0.1],
      position: [0, 3.2, -1.5],
      color: 'fur',
      bone: 'tail_4',
    });
    const r = validateSpec(s);
    expect(r.spec!.parts.find((p) => p.id === 'tail_tip')!.bone).toBe('tail_4');
  });

  it('drops invalid palette entries and warns', () => {
    const s = clone(cat) as { palette: Record<string, string> };
    s.palette.bad = 'orange';
    s.palette.short = '#fa0';
    const r = validateSpec(s);
    expect(r.spec!.palette.bad).toBeUndefined();
    expect(r.spec!.palette.short).toBe('#FFAA00');
  });

  it('shifts a floating or sunk model to the ground', () => {
    const s = clone(cat);
    for (const p of s.parts) {
      if ('position' in p) {
        const pos = p.position as number[];
        p.position = [pos[0], pos[1] + 3, pos[2]] as never;
      }
      if ('points' in p)
        (p as { points: number[][] }).points = (p as { points: number[][] }).points.map((q) => [
          q[0],
          q[1] + 3,
          q[2],
        ]);
    }
    const r = validateSpec(s);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /ground/.test(w))).toBe(true);
    const lowest = Math.min(...r.spec!.parts.map((p) => p.position[1]));
    expect(lowest).toBeLessThan(1);
  });

  it('warns about mirrored parts at x = 0', () => {
    const s = clone(cat);
    (s.parts[0] as { mirror?: string }).mirror = 'x';
    const r = validateSpec(s);
    expect(r.warnings.some((w) => /x = 0/.test(w))).toBe(true);
  });

  it('truncates parts above the limit with a warning', () => {
    const s = clone(cat);
    const extra = Array.from({ length: 200 }, (_, i) => ({
      id: `p${i}`,
      shape: 'sphere',
      radii: [0.1, 0.1, 0.1],
      position: [0, 1, 0],
      color: 'fur',
      bone: 'spine',
    }));
    (s as { parts: unknown[] }).parts = extra;
    const r = validateSpec(s);
    expect(r.spec!.parts.length).toBe(150);
    expect(r.warnings.some((w) => /150/.test(w))).toBe(true);
  });
});
