import { describe, expect, it } from 'vitest';
import { buildReliefMesh, type ReliefInput } from './mesh';

const SIZE = 64;

function disc(radius: number): ReliefInput {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  const depth = new Uint8ClampedArray(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - SIZE / 2;
      const dy = y - SIZE / 2;
      const d = Math.hypot(dx, dy);
      const o = (y * SIZE + x) * 4;
      if (d < radius) rgba.set([200, 100, 50, 255], o);
      // brighter (closer) toward the middle
      depth[y * SIZE + x] = Math.max(0, 255 - d * 6);
    }
  }
  return {
    depth,
    depthWidth: SIZE,
    depthHeight: SIZE,
    rgba,
    width: SIZE,
    height: SIZE,
    grid: 16,
    reliefDepth: 0.4,
  };
}

describe('buildReliefMesh', () => {
  const mesh = buildReliefMesh(disc(24));
  const triangles = mesh.indices.length / 3;

  it('produces a mesh', () => {
    expect(triangles).toBeGreaterThan(100);
    expect(mesh.colors.length).toBe(mesh.positions.length);
  });

  it('leaves the background out', () => {
    // The disc covers about 0.375 of the width, so nothing should sit near the corners.
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(Math.hypot(mesh.positions[i], mesh.positions[i + 1])).toBeLessThan(0.5);
    }
  });

  it('is closed: every edge is shared by exactly two triangles', () => {
    const edges = new Map<string, number>();
    for (let t = 0; t < mesh.indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = mesh.indices[t + k];
        const b = mesh.indices[t + ((k + 1) % 3)];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    const bad = [...edges.values()].filter((c) => c !== 2);
    expect(bad).toHaveLength(0);
  });

  it('is oriented outward (positive volume)', () => {
    let volume = 0;
    const p = mesh.positions;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3];
      volume +=
        (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
          p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
          p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
        6;
    }
    expect(volume).toBeGreaterThan(0);
  });

  it('puts the closest part of the picture highest', () => {
    const p = mesh.positions;
    let zMax = -Infinity;
    let atX = 0;
    let atY = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i + 2] > zMax) {
        zMax = p[i + 2];
        atX = p[i];
        atY = p[i + 1];
      }
    }
    expect(Math.hypot(atX, atY)).toBeLessThan(0.15);
    expect(zMax).toBeLessThanOrEqual(0.03 + 0.4 + 1e-6);
    expect(zMax).toBeGreaterThan(0.3);
  });

  it('keeps picture colors on the front and darkens the back', () => {
    const colors = mesh.colors;
    let brightest = 0;
    let dimmest = 1;
    for (let i = 0; i < colors.length; i += 3) {
      brightest = Math.max(brightest, colors[i]);
      dimmest = Math.min(dimmest, colors[i]);
    }
    expect(brightest).toBeCloseTo(200 / 255, 2);
    expect(dimmest).toBeLessThan(brightest);
  });

  it('returns an empty mesh for a fully transparent picture', () => {
    const input = disc(24);
    input.rgba.fill(0);
    expect(buildReliefMesh(input).indices.length).toBe(0);
  });
});
