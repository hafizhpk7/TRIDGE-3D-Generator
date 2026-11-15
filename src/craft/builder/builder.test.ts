import { describe, expect, it } from 'vitest';
import { SkinnedMesh } from 'three';
import cat from '../fixtures/cat.json';
import penguin from '../fixtures/penguin.json';
import { validateSpec } from '../spec/validate';
import type { ShapeSpec, TubePart } from '../spec/types';
import { buildCraft, partAtFace } from './build';
import { expandSpec } from './expand';
import { buildTube, segmentsFor } from './geometry';
import { createCraftObject } from './object';

const spec = (f: unknown): ShapeSpec => {
  const r = validateSpec(JSON.parse(JSON.stringify(f)));
  if (!r.spec) throw new Error(r.errors.join('; '));
  return r.spec;
};

describe('expandSpec: mirroring', () => {
  const x = expandSpec(spec(cat));

  it('creates _r twins for mirrored parts with flipped x and rotation', () => {
    const l = x.parts.find((p) => p.id === 'ear_l')!;
    const r = x.parts.find((p) => p.id === 'ear_r')!;
    expect(r).toBeDefined();
    expect(r.position[0]).toBeCloseTo(-l.position[0]);
    expect(r.position[1]).toBeCloseTo(l.position[1]);
    expect(r.rotation).toEqual([0, -0, 14]);
    expect(r.bone).toBe('head');
  });

  it('renames bones and bone references by suffix only', () => {
    expect(x.bones.map((b) => b.name)).toEqual(
      expect.arrayContaining(['leg_front_l', 'leg_front_r', 'leg_back_r']),
    );
    expect(x.parts.find((p) => p.id === 'paw_front_r')!.bone).toBe('leg_front_r');
    const rb = x.bones.find((b) => b.name === 'leg_front_r')!;
    expect(rb.head[0]).toBeCloseTo(-0.42);
    expect(rb.parent).toBe('chest');
  });

  it('does not copy parts that sit at x = 0 and never leaves mirror flags behind', () => {
    const s = spec(cat);
    s.parts.find((p) => p.id === 'body')!.mirror = 'x';
    const e = expandSpec(s);
    expect(e.parts.filter((p) => p.id.startsWith('body')).length).toBe(1);
    expect(e.warnings.some((w) => /x = 0/.test(w))).toBe(true);
    expect(e.parts.every((p) => p.mirror === undefined)).toBe(true);
  });

  it('puts parents before children', () => {
    const seen = new Set<string>();
    for (const b of x.bones) {
      if (b.parent) expect(seen.has(b.parent)).toBe(true);
      seen.add(b.name);
    }
  });
});

describe('expandSpec: tube bone chains', () => {
  const x = expandSpec(spec(cat));

  it('creates chainLength bones with correct parenting', () => {
    const chain = x.chains.get('tail')!;
    expect(chain.bones).toEqual(['tail_1', 'tail_2', 'tail_3', 'tail_4']);
    const byName = new Map(x.bones.map((b) => [b.name, b]));
    expect(byName.get('tail_1')!.parent).toBe('hips');
    expect(byName.get('tail_2')!.parent).toBe('tail_1');
    expect(byName.get('tail_4')!.parent).toBe('tail_3');
  });

  it('places the first chain bone at the start of the tube', () => {
    const h = expandSpec(spec(cat)).bones.find((b) => b.name === 'tail_1')!.head;
    expect(h[1]).toBeCloseTo(1.45, 1);
    expect(h[2]).toBeCloseTo(-1.1, 1);
  });
});

describe('buildCraft', () => {
  const built = buildCraft(spec(cat), { detail: 5 });

  it('matches the expected part and triangle counts at detail 5 (snapshot)', () => {
    expect(built.partCount).toBe(25);
    expect(built.triangles).toMatchInlineSnapshot(`1334`);
    expect(built.positions.length).toBe(built.triangles * 9);
    expect(built.normals.length).toBe(built.positions.length);
    expect(built.colors.length).toBe(built.positions.length);
  });

  it('keeps skin weights normalized and bone indices valid', () => {
    const vertices = built.positions.length / 3;
    for (let v = 0; v < vertices; v++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += built.skinWeights[v * 4 + k];
        if (built.skinWeights[v * 4 + k] > 0) {
          expect(built.skinIndices[v * 4 + k]).toBeLessThan(built.bones.length);
        }
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('skins a tube smoothly across its chain bones', () => {
    const range = built.ranges.find((r) => r.id === 'tail')!;
    const tailBones = new Set(
      ['tail_1', 'tail_2', 'tail_3', 'tail_4'].map((n) =>
        built.bones.findIndex((b) => b.name === n),
      ),
    );
    let blended = 0;
    for (let v = range.start; v < range.start + range.count; v++) {
      expect(tailBones.has(built.skinIndices[v * 4])).toBe(true);
      if (built.skinWeights[v * 4 + 1] > 0.01) blended++;
    }
    expect(blended).toBeGreaterThan(range.count / 3);
  });

  it('uses rigid weights for normal parts', () => {
    const range = built.ranges.find((r) => r.id === 'head')!;
    const headBone = built.bones.findIndex((b) => b.name === 'head');
    for (let v = range.start; v < range.start + range.count; v += 7) {
      expect(built.skinIndices[v * 4]).toBe(headBone);
      expect(built.skinWeights[v * 4]).toBe(1);
    }
  });

  it('shares vertices near limb joints with the parent when soft joints are on', () => {
    const on = buildCraft(spec(cat), { detail: 5, softJoints: true });
    const off = buildCraft(spec(cat), { detail: 5, softJoints: false });
    const shared = (b: typeof on) => {
      let n = 0;
      for (let v = 0; v < b.positions.length / 3; v++) if (b.skinWeights[v * 4] === 0.5) n++;
      return n;
    };
    expect(shared(on)).toBeGreaterThan(0);
    expect(shared(off)).toBe(0);
  });

  it('gets more triangles as detail goes up', () => {
    const counts = [1, 4, 7, 10].map((d) => buildCraft(spec(cat), { detail: d }).triangles);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });

  it('lets "sides" win over the detail slider', () => {
    const s = spec(cat);
    const ear = s.parts.find((p) => p.id === 'ear_l')!;
    expect(ear.sides).toBe(4);
    const lo = buildCraft(s, { detail: 1 });
    const hi = buildCraft(s, { detail: 10 });
    const count = (b: typeof lo) => b.ranges.find((r) => r.id === 'ear_l')!.count;
    expect(count(lo)).toBe(count(hi));
  });

  it('builds a 60-part spec quickly', () => {
    const s = spec(cat);
    s.parts = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      shape: 'sphere' as const,
      radii: [0.2, 0.2, 0.2] as [number, number, number],
      position: [(i % 10) * 0.3 - 1.5, 1 + Math.floor(i / 10) * 0.3, 0] as [number, number, number],
      color: 'fur',
      bone: 'spine',
    }));
    const t0 = performance.now();
    buildCraft(s, { detail: 5 });
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('maps a face index back to its part', () => {
    const first = built.ranges[0];
    expect(partAtFace(built.ranges, 0)).toBe(first.id);
    expect(partAtFace(built.ranges, built.triangles - 1)).toBe(built.ranges.at(-1)!.id);
    expect(partAtFace(built.ranges, built.triangles + 5)).toBeNull();
  });

  it('builds the penguin', () => {
    const b = buildCraft(spec(penguin), { detail: 5 });
    expect(b.partCount).toBeGreaterThan(10);
    expect(b.triangles).toBeGreaterThan(300);
  });
});

describe('geometry', () => {
  it('maps detail to segment counts as specified', () => {
    const s = segmentsFor('sphere', 5);
    expect(s.sphereW).toBe(7);
    expect(s.sphereH).toBe(5);
    expect(segmentsFor('cylinder', 5).radial).toBe(7);
    expect(segmentsFor('cylinder', 1).radial).toBe(4);
    expect(segmentsFor('torus', 5).torusRadial).toBe(8);
    expect(segmentsFor('torus', 5).torusTubular).toBe(16);
    expect(segmentsFor('box', 7).boxSegments).toBe(2);
    expect(segmentsFor('box', 6).boxSegments).toBe(1);
    expect(segmentsFor('cone', 5, 4).radial).toBe(4);
  });

  it('builds a closed, outward-facing tube', () => {
    const tube: TubePart = {
      id: 't',
      shape: 'tube',
      position: [0, 0, 0],
      color: 'fur',
      bone: 'root',
      points: [
        [0, 0, 0],
        [0, 1, 0.3],
        [0, 2, 0],
      ],
      radiusStart: 0.3,
      radiusEnd: 0.1,
    };
    const m = buildTube(tube, 5);
    const p = m.positions;
    let volume = 0;
    for (let i = 0; i < p.length; i += 9) {
      volume +=
        (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) -
          p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) +
          p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) /
        6;
    }
    expect(volume).toBeGreaterThan(0);
    expect(m.curveT!.length).toBe(p.length / 3);
  });
});

describe('createCraftObject', () => {
  it('makes a rigged SkinnedMesh with the full skeleton', () => {
    const built = buildCraft(spec(cat), { detail: 5 });
    const group = createCraftObject(built, 'Cat');
    const mesh = group.children[0] as SkinnedMesh;
    expect(mesh).toBeInstanceOf(SkinnedMesh);
    expect(mesh.skeleton.bones.length).toBe(built.bones.length);
    expect(mesh.skeleton.bones.map((b) => b.name)).toContain('tail_3');
    const material = mesh.material as unknown as { vertexColors: boolean; flatShading: boolean };
    expect(material.vertexColors).toBe(true);
    expect(material.flatShading).toBe(true);
    const root = mesh.skeleton.bones.find((b) => b.name === 'root')!;
    expect(root.parent).toBe(mesh);
  });
});
