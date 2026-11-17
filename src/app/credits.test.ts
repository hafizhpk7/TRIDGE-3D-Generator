import { describe, expect, it } from 'vitest';
import { LIBRARY_CREDITS, LIMITS, LOCAL_CREDITS, ONLINE_CREDITS, type Credit } from './credits';

const all: Credit[] = [...ONLINE_CREDITS, ...LOCAL_CREDITS, ...LIBRARY_CREDITS];

describe('credits', () => {
  it('give every entry a name, a use, a license and a secure link', () => {
    for (const c of all) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.use.length).toBeGreaterThan(10);
      expect(c.license.length).toBeGreaterThan(2);
      expect(c.url).toMatch(/^https:\/\//);
    }
  });

  it('list each thing once', () => {
    expect(new Set(all.map((c) => c.name)).size).toBe(all.length);
  });

  it('flag the one license with conditions', () => {
    const sf3d = ONLINE_CREDITS.find((c) => /Stable Fast 3D/.test(c.name));
    expect(sf3d?.note).toMatch(/US\$1 million/);
  });

  it('are honest about the known limits', () => {
    expect(LIMITS.length).toBeGreaterThanOrEqual(5);
    const text = LIMITS.join(' ');
    for (const word of ['offline', 'back of a model', 'rigging', 'ready-made', 'toys']) {
      expect(text).toContain(word);
    }
  });
});
