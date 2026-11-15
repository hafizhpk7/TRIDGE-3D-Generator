import { describe, expect, it } from 'vitest';
import { BoxGeometry } from 'three';
import { makeFrame, type Vec3 } from './frame';
import { SKELETONS } from './skeleton';
import { buildSkinBones, boneTip, computeSkinWeights } from './skin';
import { suggestJoints } from './suggest';

function cloud(parts: { size: Vec3; at: Vec3; seg?: number }[]): Float32Array {
  const out: number[] = [];
  for (const { size, at, seg = 3 } of parts) {
    const g = new BoxGeometry(size[0], size[1], size[2], seg, seg, seg).toNonIndexed();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      out.push(p.getX(i) + at[0], p.getY(i) + at[1], p.getZ(i) + at[2]);
  }
  return new Float32Array(out);
}

const quadrupedPositions = () =>
  cloud([
    { size: [1.2, 1, 2.6], at: [0, 1.4, 0] },
    { size: [0.4, 1, 0.4], at: [0.45, 0.5, 0.85] },
    { size: [0.4, 1, 0.4], at: [-0.45, 0.5, 0.85] },
    { size: [0.4, 1, 0.4], at: [0.45, 0.5, -0.85] },
    { size: [0.4, 1, 0.4], at: [-0.45, 0.5, -0.85] },
    { size: [0.9, 0.9, 0.9], at: [0, 2.3, 1.5] },
    { size: [0.2, 0.2, 1], at: [0, 1.6, -1.8] },
  ]);

function rig(positions = quadrupedPositions()) {
  const s = suggestJoints('quadruped', positions, '+z');
  const bones = buildSkinBones(s.joints, SKELETONS.quadruped, s.frame, 'quadruped');
  return {
    s,
    bones,
    positions,
    result: computeSkinWeights({ positions, indices: null, bones, frame: s.frame }),
  };
}

/** The bone with the largest weight for the vertex nearest to a model-space point. */
function dominantNear(r: ReturnType<typeof rig>, p: Vec3): string {
  let best = 0;
  let bd = Infinity;
  const pos = r.positions;
  for (let i = 0; i < pos.length / 3; i++) {
    const d =
      (pos[i * 3] - p[0]) ** 2 + (pos[i * 3 + 1] - p[1]) ** 2 + (pos[i * 3 + 2] - p[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  let top = 0;
  for (let k = 1; k < 4; k++)
    if (r.result.skinWeights[best * 4 + k] > r.result.skinWeights[best * 4 + top]) top = k;
  return r.bones[r.result.skinIndices[best * 4 + top]].name;
}

describe('boneTip', () => {
  const frame = makeFrame(quadrupedPositions(), '+z');
  it('sends legs to the ground and arms to the side', () => {
    const leg = boneTip('leg_front_l', [0.45, 1.5, 0.85], [0, 1.4, 0.8], frame, 'quadruped');
    expect(leg[1]).toBeLessThan(0.2);
    expect(leg[0]).toBeCloseTo(0.45);
    const arm = boneTip('arm_r', [-0.3, 1.5, 0], [0, 1.5, 0], frame, 'biped');
    expect(arm[0]).toBeLessThan(-0.5);
  });
  it('sends a head forward on animals and up on people', () => {
    const animal = boneTip('head', [0, 2.2, 1.5], null, frame, 'quadruped');
    expect(animal[2]).toBeCloseTo(frame.u1);
    const person = boneTip('head', [0, 2.2, 0], null, frame, 'biped');
    expect(person[1]).toBeCloseTo(frame.v1);
  });
});

describe('computeSkinWeights', () => {
  const r = rig();
  const vertices = r.positions.length / 3;

  it('gives every vertex weights that sum to one, with valid bone indices', () => {
    for (let v = 0; v < vertices; v++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const w = r.result.skinWeights[v * 4 + k];
        expect(w).toBeGreaterThanOrEqual(0);
        sum += w;
        expect(r.result.skinIndices[v * 4 + k]).toBeLessThan(r.bones.length);
      }
      expect(sum).toBeCloseTo(1, 4);
    }
  });

  it('never uses the root bone when there are other bones', () => {
    const root = r.bones.findIndex((b) => b.name === 'root');
    for (let v = 0; v < vertices; v++) {
      for (let k = 0; k < 4; k++) {
        if (r.result.skinWeights[v * 4 + k] > 1e-6)
          expect(r.result.skinIndices[v * 4 + k]).not.toBe(root);
      }
    }
  });

  it('assigns each leg to its own bone', () => {
    expect(dominantNear(r, [0.45, 0.15, 0.85])).toBe('leg_front_l');
    expect(dominantNear(r, [-0.45, 0.15, 0.85])).toBe('leg_front_r');
    expect(dominantNear(r, [0.45, 0.15, -0.85])).toBe('leg_back_l');
    expect(dominantNear(r, [-0.45, 0.15, -0.85])).toBe('leg_back_r');
  });

  it('assigns the head and tail to their bones', () => {
    expect(dominantNear(r, [0, 2.6, 1.5])).toBe('head');
    expect(dominantNear(r, [0, 1.6, -2.2])).toMatch(/^tail_/);
  });

  it('keeps left and right symmetric', () => {
    const wOf = (p: Vec3) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < vertices; i++) {
        const d =
          (r.positions[i * 3] - p[0]) ** 2 +
          (r.positions[i * 3 + 1] - p[1]) ** 2 +
          (r.positions[i * 3 + 2] - p[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return Array.from(r.result.skinWeights.subarray(best * 4, best * 4 + 4)).reduce(
        (a, b) => Math.max(a, b),
        0,
      );
    };
    expect(wOf([0.45, 0.4, 0.85])).toBeCloseTo(wOf([-0.45, 0.4, 0.85]), 1);
  });

  it('blends across a joint instead of cutting hard', () => {
    // a point on the body just above a leg should share weight between body and leg bones
    let blended = 0;
    for (let v = 0; v < vertices; v++) if (r.result.skinWeights[v * 4 + 1] > 0.15) blended++;
    expect(blended).toBeGreaterThan(vertices * 0.05);
  });

  it('gives welded duplicates identical weights, so flat meshes do not tear', () => {
    const seen = new Map<string, string>();
    for (let v = 0; v < vertices; v++) {
      const key = [0, 1, 2].map((a) => Math.round(r.positions[v * 3 + a] * 1e4)).join(',');
      const val =
        Array.from(r.result.skinWeights.subarray(v * 4, v * 4 + 4)).join(',') +
        '|' +
        Array.from(r.result.skinIndices.subarray(v * 4, v * 4 + 4)).join(',');
      const prev = seen.get(key);
      if (prev !== undefined) expect(val).toBe(prev);
      else seen.set(key, val);
    }
  });

  it('smoothing makes neighbours more alike', () => {
    const s = suggestJoints('quadruped', r.positions, '+z');
    const bones = buildSkinBones(s.joints, SKELETONS.quadruped, s.frame, 'quadruped');
    const roughness = (iters: number) => {
      const res = computeSkinWeights({
        positions: r.positions,
        indices: null,
        bones,
        frame: s.frame,
        smoothIterations: iters,
      });
      // total variation between consecutive triangle corners that are close together
      let total = 0;
      for (let t = 0; t < vertices; t += 3) {
        for (let k = 0; k < 4; k++)
          total += Math.abs(res.skinWeights[t * 4 + k] - res.skinWeights[(t + 1) * 4 + k]);
      }
      return total;
    };
    expect(roughness(4)).toBeLessThanOrEqual(roughness(0) + 1e-6);
  });

  it('is deterministic', () => {
    const again = rig();
    expect(Array.from(again.result.skinWeights)).toEqual(Array.from(r.result.skinWeights));
  });

  it('gives a lone root everything', () => {
    const pos = quadrupedPositions();
    const s = suggestJoints('object', pos, '+z');
    const bones = buildSkinBones(s.joints, SKELETONS.object, s.frame, 'object');
    const res = computeSkinWeights({ positions: pos, indices: null, bones, frame: s.frame });
    expect(res.skinIndices[0]).toBe(0);
    expect(res.skinWeights[0]).toBeCloseTo(1);
  });

  it('survives an empty mesh', () => {
    const s = suggestJoints('quadruped', quadrupedPositions(), '+z');
    const bones = buildSkinBones(s.joints, SKELETONS.quadruped, s.frame, 'quadruped');
    const res = computeSkinWeights({
      positions: new Float32Array(0),
      indices: null,
      bones,
      frame: s.frame,
    });
    expect(res.skinIndices.length).toBe(0);
  });
});
