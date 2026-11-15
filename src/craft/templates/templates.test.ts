import { describe, expect, it } from 'vitest';
import { boxesTouch, partBounds } from '../spec/bounds';
import { expandSpec } from '../builder/expand';
import { buildCraft } from '../builder/build';
import { BODY_TYPES } from '../spec/types';
import { validateSpec } from '../spec/validate';
import { TEMPLATES, buildTemplateSpec, getTemplate, randomParams } from './index';

/** Small deterministic generator so failures are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parts whose box touches no other part, apart from ones flagged detached. */
function floatingParts(spec: ReturnType<typeof buildTemplateSpec>): string[] {
  const parts = expandSpec(spec).parts;
  const boxes = parts.map(partBounds);
  const floating: string[] = [];
  parts.forEach((p, i) => {
    if (p.detached) return;
    const touches = boxes.some((b, j) => j !== i && boxesTouch(boxes[i], b, 0.02));
    if (!touches) floating.push(p.id);
  });
  return floating;
}

describe('template library', () => {
  it('has the eight required templates', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'cat',
      'dog',
      'bunny',
      'bird',
      'fish',
      'human',
      'robot',
      'car',
    ]);
    expect(getTemplate('cat')?.name).toBe('Cat');
    expect(getTemplate('nope')).toBeUndefined();
  });

  it('declares sensible parameters', () => {
    for (const t of TEMPLATES) {
      expect(BODY_TYPES).toContain(t.bodyType);
      expect(t.params.length).toBeGreaterThanOrEqual(3);
      for (const def of t.params) {
        expect(t.defaults[def.key], `${t.id}.${def.key} default`).toBeDefined();
        if (def.type === 'range') {
          const v = t.defaults[def.key] as number;
          expect(v).toBeGreaterThanOrEqual(def.min);
          expect(v).toBeLessThanOrEqual(def.max);
        }
        if (def.type === 'select') {
          expect(def.options.map((o) => o.value)).toContain(t.defaults[def.key]);
        }
      }
    }
  });
});

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('template %s', (_id, template) => {
  it('builds a valid spec with defaults and no auto-fixes needed', () => {
    const raw = template.build(template.defaults);
    const result = validateSpec(JSON.parse(JSON.stringify(raw)));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.spec!.bodyType).toBe(template.bodyType);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(template.build(template.defaults))).toBe(
      JSON.stringify(template.build(template.defaults)),
    );
  });

  it('stays valid and connected across 200 random parameter sets', () => {
    const rand = rng(template.id.length * 7919 + 17);
    for (let i = 0; i < 200; i++) {
      const params = randomParams(template, rand);
      const spec = template.build({ ...template.defaults, ...params });
      const result = validateSpec(JSON.parse(JSON.stringify(spec)));
      expect(result.errors, JSON.stringify(params)).toEqual([]);
      // Nothing should be dropped, clamped or moved: templates must already respect the limits.
      expect(result.warnings, JSON.stringify(params)).toEqual([]);
      const floating = floatingParts(result.spec!);
      expect(floating, `floating parts for ${JSON.stringify(params)}`).toEqual([]);
    }
  });

  it('builds at every detail level', () => {
    const spec = buildTemplateSpec(template, {});
    let previous = 0;
    for (const detail of [1, 3, 5, 8, 10]) {
      const built = buildCraft(spec, { detail });
      expect(built.triangles).toBeGreaterThan(previous);
      previous = built.triangles;
      expect(built.partCount).toBeGreaterThan(5);
      expect(built.warnings).toEqual([]);
    }
  });

  it('keeps part and triangle counts stable at detail 5 (snapshot)', () => {
    const built = buildCraft(buildTemplateSpec(template, {}), { detail: 5 });
    expect({ parts: built.partCount, triangles: built.triangles }).toMatchSnapshot();
  });

  it('stands on the ground', () => {
    const spec = buildTemplateSpec(template, {});
    const lowest = Math.min(...expandSpec(spec).parts.map((p) => partBounds(p).min[1]));
    expect(lowest).toBeGreaterThan(-0.05);
    expect(lowest).toBeLessThan(0.15);
  });
});

describe('proportions move the skeleton', () => {
  it('longer legs lift the hips', () => {
    const cat = getTemplate('cat')!;
    const hipY = (legLen: number) =>
      buildTemplateSpec(cat, { legLen }).bones.find((b) => b.name === 'hips')!.head[1];
    expect(hipY(1.3)).toBeGreaterThan(hipY(0.7));
  });

  it('a bigger head raises the head bone', () => {
    const cat = getTemplate('cat')!;
    const headY = (head: number) =>
      buildTemplateSpec(cat, { head }).bones.find((b) => b.name === 'head')!.head[1];
    expect(headY(1.3)).toBeGreaterThan(headY(0.8));
  });

  it('color parameters reach the palette', () => {
    const cat = getTemplate('cat')!;
    expect(buildTemplateSpec(cat, { fur: '#112233' }).palette.fur).toBe('#112233');
  });
});
