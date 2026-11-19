import { describe, expect, it } from 'vitest';
import { STEPS } from './steps';

describe('steps', () => {
  it('lists the journey in order, with Rig before Animate', () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      'input',
      'generate',
      'lowpoly',
      'rig',
      'animate',
      'export',
    ]);
  });

  it('gives every step a unique id, a short title and a hint', () => {
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
    for (const s of STEPS) {
      expect(s.title.length).toBeLessThanOrEqual(10); // must fit one phone-width column
      expect(s.hint.length).toBeGreaterThan(10);
    }
  });

  it('uses only colours that exist as design tokens', () => {
    const tokens = ['pink', 'orange', 'yellow', 'mint', 'sky', 'violet'];
    for (const s of STEPS) expect(tokens).toContain(s.color);
  });
});
