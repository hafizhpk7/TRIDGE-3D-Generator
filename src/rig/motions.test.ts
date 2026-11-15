import { describe, expect, it } from 'vitest';
import { IDENTITY, MOTIONS, motionTransform, type MotionId } from './motions';

const params = { speed: 1, intensity: 1 };
const H = 2.4;

describe('no-rig motions', () => {
  it('lists the seven required motions', () => {
    expect(MOTIONS.map((m) => m.id)).toEqual([
      'bounce',
      'hop',
      'spin',
      'wobble',
      'squash',
      'float',
      'shake',
    ]);
  });

  it('never moves the model below the ground and keeps scales positive', () => {
    for (const { id } of MOTIONS) {
      for (let i = 0; i < 400; i++) {
        const tr = motionTransform(id, i * 0.037, params, H);
        expect(tr.position[1], `${id} y at ${i}`).toBeGreaterThanOrEqual(-1e-9);
        for (const s of tr.scale) expect(s).toBeGreaterThan(0.3);
        for (const v of [...tr.position, ...tr.rotation]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('with zero intensity (except spin) stands still', () => {
    for (const id of ['bounce', 'hop', 'wobble', 'squash', 'float', 'shake'] as MotionId[]) {
      const tr = motionTransform(id, 0.7, { speed: 1, intensity: 0 }, H);
      expect(tr.position[0]).toBeCloseTo(0);
      expect(tr.position[1]).toBeCloseTo(0);
      expect(tr.rotation.every((r) => Math.abs(r) < 1e-9)).toBe(true);
      expect(tr.scale).toEqual(IDENTITY.scale);
    }
  });

  it('bounce lifts the model and squashes it when it lands', () => {
    let maxY = 0;
    let minScaleY = Infinity;
    for (let i = 0; i < 500; i++) {
      const tr = motionTransform('bounce', i * 0.01, params, H);
      maxY = Math.max(maxY, tr.position[1]);
      minScaleY = Math.min(minScaleY, tr.scale[1]);
    }
    expect(maxY).toBeGreaterThan(0.2 * H);
    expect(minScaleY).toBeLessThan(0.95);
  });

  it('squash and stretch keeps the volume roughly constant', () => {
    for (let i = 0; i < 100; i++) {
      const [x, y, z] = motionTransform('squash', i * 0.05, params, H).scale;
      expect(x * y * z).toBeCloseTo(1, 5);
    }
  });

  it('hop pauses between jumps', () => {
    const grounded = Array.from(
      { length: 200 },
      (_, i) => motionTransform('hop', i * 0.01, params, H).position[1],
    );
    expect(grounded.some((y) => y === 0)).toBe(true);
    expect(Math.max(...grounded)).toBeGreaterThan(0.3);
  });

  it('spin keeps turning and speed changes how fast', () => {
    const slow = motionTransform('spin', 1, { speed: 0.5, intensity: 1 }, H).rotation[1];
    const fast = motionTransform('spin', 1, { speed: 2, intensity: 1 }, H).rotation[1];
    expect(fast).toBeGreaterThan(slow * 3.9);
  });

  it('scales movement with the size of the model', () => {
    const small = Math.max(
      ...Array.from(
        { length: 200 },
        (_, i) => motionTransform('float', i * 0.05, params, 1).position[1],
      ),
    );
    const big = Math.max(
      ...Array.from(
        { length: 200 },
        (_, i) => motionTransform('float', i * 0.05, params, 4).position[1],
      ),
    );
    expect(big).toBeCloseTo(small * 4, 5);
  });

  it('repeats on a cycle', () => {
    const a = motionTransform('wobble', 0.3, params, H);
    const b = motionTransform('wobble', 0.3 + (1 / (params.speed * 0.75)) * 1, params, H);
    expect(b.rotation[2]).toBeCloseTo(a.rotation[2], 5);
  });
});
