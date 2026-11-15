import { describe, expect, it } from 'vitest';
import { BoxGeometry, SphereGeometry } from 'three';
import { makeFrame, mirrorPoint, toFrame, toModel, twinName, type Vec3 } from './frame';
import { SKELETONS, childrenOf } from './skeleton';
import { autoFacing, findLegColumns, suggestJoints } from './suggest';

/** Merge boxes/spheres into one flat position array. */
function cloud(parts: { geo: BoxGeometry | SphereGeometry; at: Vec3 }[]): Float32Array {
  const out: number[] = [];
  for (const { geo, at } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      out.push(p.getX(i) + at[0], p.getY(i) + at[1], p.getZ(i) + at[2]);
  }
  return new Float32Array(out);
}
const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d, 3, 3, 3);

/** A cat-like quadruped: body, four legs, head and a thin tail. Head toward +Z by default. */
function quadruped(flip = 1, swapAxes = false): Float32Array {
  const parts: { geo: BoxGeometry | SphereGeometry; at: Vec3 }[] = [
    { geo: box(1.2, 1, 2.6), at: [0, 1.4, 0] },
    { geo: box(0.4, 1, 0.4), at: [0.45, 0.5, 0.85] },
    { geo: box(0.4, 1, 0.4), at: [-0.45, 0.5, 0.85] },
    { geo: box(0.4, 1, 0.4), at: [0.45, 0.5, -0.85] },
    { geo: box(0.4, 1, 0.4), at: [-0.45, 0.5, -0.85] },
    { geo: box(0.9, 0.9, 0.9), at: [0, 2.3, 1.5] }, // head: higher than the rear
    { geo: box(0.2, 0.2, 1), at: [0, 1.6, -1.8] },
  ];
  const pos = cloud(parts);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 2] *= flip;
    if (swapAxes) {
      const x = pos[i];
      pos[i] = pos[i + 2];
      pos[i + 2] = x;
    }
  }
  return pos;
}

function biped(): Float32Array {
  return cloud([
    { geo: box(0.7, 1.0, 0.4), at: [0, 1.6, 0] }, // torso
    { geo: box(0.25, 1.0, 0.25), at: [0.2, 0.5, 0] },
    { geo: box(0.25, 1.0, 0.25), at: [-0.2, 0.5, 0] },
    { geo: new SphereGeometry(0.35, 8, 6), at: [0, 2.45, 0] },
    { geo: box(0.25, 0.9, 0.25), at: [0.55, 1.6, 0] },
    { geo: box(0.25, 0.9, 0.25), at: [-0.55, 1.6, 0] },
  ]);
}

describe('frame', () => {
  it('converts between model space and the facing frame', () => {
    const f = makeFrame(new Float32Array([0, 0, 0, 1, 2, 3]), '+x');
    const p: Vec3 = [0.4, 1.2, -0.7];
    const { u, v, w } = toFrame(f, p);
    const back = toModel(f, u, v, w);
    back.forEach((n, i) => expect(n).toBeCloseTo(p[i]));
  });

  it('puts the model left at +x when facing +z, like Craft', () => {
    const f = makeFrame(new Float32Array([0, 0, 0, 1, 1, 1]), '+z');
    expect(f.left[0]).toBe(1);
    expect(f.left[2] + 0).toBe(0);
    const g = makeFrame(new Float32Array([0, 0, 0, 1, 1, 1]), '-z');
    expect(g.left[0]).toBe(-1);
    expect(g.left[2] + 0).toBe(0);
  });

  it('mirrors across the middle', () => {
    const f = makeFrame(new Float32Array([-1, 0, -2, 1, 2, 2]), '+z');
    expect(mirrorPoint(f, [0.5, 1, 1])).toEqual([-0.5, 1, 1]);
  });

  it('pairs left and right names', () => {
    expect(twinName('leg_l')).toBe('leg_r');
    expect(twinName('arm_r')).toBe('arm_l');
    expect(twinName('head')).toBeNull();
  });
});

describe('skeleton templates', () => {
  it('has a single root and valid parents for every body type', () => {
    for (const [type, joints] of Object.entries(SKELETONS)) {
      const names = new Set(joints.map((j) => j.name));
      expect(joints.filter((j) => j.parent === null)).toHaveLength(1);
      for (const j of joints)
        if (j.parent) expect(names.has(j.parent), `${type}.${j.name}`).toBe(true);
      expect(names.size).toBe(joints.length);
    }
  });

  it('uses the required Craft bone names', () => {
    const has = (t: keyof typeof SKELETONS, ...n: string[]) => {
      const names = new Set(SKELETONS[t].map((j) => j.name));
      n.forEach((x) => expect(names.has(x), `${t}.${x}`).toBe(true));
    };
    has(
      'quadruped',
      'root',
      'hips',
      'spine',
      'chest',
      'head',
      'leg_front_l',
      'leg_front_r',
      'leg_back_l',
      'leg_back_r',
    );
    has('biped', 'root', 'hips', 'spine', 'chest', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r');
    has('bird', 'root', 'body', 'head', 'wing_l', 'wing_r', 'leg_l', 'leg_r');
    has('fish', 'root', 'body', 'head', 'tail_1');
    has('snake', 'root', 'segment_1', 'head');
  });

  it('lists children per bone', () => {
    const kids = childrenOf(SKELETONS.quadruped);
    expect(kids.get('chest')).toEqual(
      expect.arrayContaining(['neck', 'leg_front_l', 'leg_front_r']),
    );
    expect(kids.get('head')).toEqual([]);
  });
});

describe('autoFacing', () => {
  it('finds the head end of a quadruped, whichever way it points', () => {
    expect(autoFacing('quadruped', quadruped(1))).toBe('+z');
    expect(autoFacing('quadruped', quadruped(-1))).toBe('-z');
    expect(autoFacing('quadruped', quadruped(1, true))).toBe('+x');
    expect(autoFacing('quadruped', quadruped(-1, true))).toBe('-x');
  });

  it('trusts the bulky end over a tall thin tail', () => {
    // a body with the head at +z, and a thin tail at -z that rises higher than the head
    const pos = cloud([
      { geo: box(1.2, 1, 2.6), at: [0, 1.4, 0] },
      { geo: box(0.9, 0.9, 0.9), at: [0, 1.9, 1.5] },
      { geo: new BoxGeometry(0.1, 1.6, 0.1, 1, 1, 1), at: [0, 2.6, -2.2] },
    ]);
    expect(autoFacing('quadruped', pos)).toBe('+z');
  });

  it('uses the thinner horizontal axis for a person', () => {
    expect(autoFacing('biped', biped())).toBe('+z'); // wide in x, thin in z
  });
});

describe('findLegColumns', () => {
  it('locates four legs', () => {
    const pos = quadruped();
    const legs = findLegColumns(pos, makeFrame(pos, '+z'))!;
    expect(legs).not.toBeNull();
    // front legs at z = 0.85, back at -0.85, left at x = 0.45
    expect(legs.frontLeft[0]).toBeCloseTo(0.85, 1);
    expect(legs.backRight[0]).toBeCloseTo(-0.85, 1);
    expect(legs.frontLeft[1]).toBeCloseTo(0.45, 1);
    expect(legs.frontRight[1]).toBeCloseTo(-0.45, 1);
  });

  it('gives up on a shape without legs', () => {
    const pos = cloud([{ geo: new SphereGeometry(1, 16, 12), at: [0, 1, 0] }]);
    expect(findLegColumns(pos, makeFrame(pos, '+z'))).toBeNull();
  });
});

describe('suggestJoints', () => {
  it('places every template joint, quadruped legs on the real legs', () => {
    const pos = quadruped();
    const s = suggestJoints('quadruped', pos, '+z');
    for (const j of SKELETONS.quadruped) expect(s.joints[j.name], j.name).toBeDefined();
    expect(s.notes).toEqual([]);
    expect(s.joints.leg_front_l[0]).toBeCloseTo(0.45, 1);
    expect(s.joints.leg_front_l[2]).toBeCloseTo(0.85, 1);
    expect(s.joints.leg_front_r[0]).toBeCloseTo(-0.45, 1);
    // head is toward the front, tail toward the back, hips lower than head
    expect(s.joints.head[2]).toBeGreaterThan(s.joints.hips[2]);
    expect(s.joints.tail_3[2]).toBeLessThan(s.joints.hips[2]);
    expect(s.joints.head[1]).toBeGreaterThan(s.joints.hips[1]);
    expect(s.joints.root[1]).toBeCloseTo(0, 1);
  });

  it('keeps left on the model left for other facings', () => {
    const pos = quadruped(-1);
    const s = suggestJoints('quadruped', pos, '-z');
    // facing -z, the model's left is -x
    expect(s.joints.leg_front_l[0]).toBeLessThan(0);
    expect(s.joints.leg_front_r[0]).toBeGreaterThan(0);
    expect(s.joints.head[2]).toBeLessThan(s.joints.hips[2]);
  });

  it('falls back to guesses with a note when legs cannot be found', () => {
    const pos = cloud([{ geo: new SphereGeometry(1, 16, 12), at: [0, 1, 0] }]);
    const s = suggestJoints('quadruped', pos, '+z');
    expect(s.notes.length).toBe(1);
    expect(s.joints.leg_front_l).toBeDefined();
  });

  it('places a biped top to bottom with arms and legs at the sides', () => {
    const s = suggestJoints('biped', biped(), '+z');
    const y = (n: string) => s.joints[n][1];
    expect(y('head')).toBeGreaterThan(y('neck'));
    expect(y('neck')).toBeGreaterThan(y('chest'));
    expect(y('chest')).toBeGreaterThan(y('hips'));
    expect(s.joints.arm_l[0]).toBeGreaterThan(0);
    expect(s.joints.arm_r[0]).toBeLessThan(0);
    expect(s.joints.leg_l[0]).toBeGreaterThan(0);
  });

  it('places the other body types', () => {
    for (const type of ['bird', 'fish', 'snake', 'object'] as const) {
      const s = suggestJoints(type, quadruped(), '+z');
      for (const j of SKELETONS[type]) expect(s.joints[j.name], `${type}.${j.name}`).toBeDefined();
    }
  });

  it('handles an empty mesh without crashing', () => {
    const s = suggestJoints('quadruped', new Float32Array(0), '+z');
    expect(s.joints.root).toBeDefined();
  });
});
