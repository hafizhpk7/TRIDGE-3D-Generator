import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import {
  computeStats,
  disposeObject,
  extensionOf,
  fitDistance,
  formatBytes,
  geometryCounts,
  isSupportedModel,
  normalizeScale,
} from './helpers';

describe('fitDistance', () => {
  it('grows with radius and shrinks with a wider field of view', () => {
    expect(fitDistance(2, 40, 1)).toBeGreaterThan(fitDistance(1, 40, 1));
    expect(fitDistance(1, 80, 1)).toBeLessThan(fitDistance(1, 40, 1));
  });

  it('backs off further on narrow (portrait) viewports', () => {
    expect(fitDistance(1, 40, 0.5)).toBeGreaterThan(fitDistance(1, 40, 1.5));
  });

  it('keeps the sphere inside the vertical frustum', () => {
    const d = fitDistance(1, 40, 2, 1);
    expect(Math.asin(1 / d)).toBeCloseTo((20 * Math.PI) / 180, 5);
  });
});

describe('normalizeScale', () => {
  it('scales the longest side to the target', () => {
    expect(normalizeScale(4, 2)).toBe(0.5);
  });
  it('ignores empty models', () => {
    expect(normalizeScale(0, 2)).toBe(1);
  });
});

describe('counts', () => {
  it('counts indexed and non-indexed triangles', () => {
    const box = new BoxGeometry(1, 1, 1);
    expect(geometryCounts(box)).toEqual({ triangles: 12, vertices: 24 });

    const raw = new BufferGeometry();
    raw.setAttribute('position', new BufferAttribute(new Float32Array(18), 3));
    expect(geometryCounts(raw)).toEqual({ triangles: 2, vertices: 6 });
  });

  it('sums over all meshes in a model', () => {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry()), new Mesh(new BoxGeometry()));
    expect(computeStats(g, 100)).toEqual({ triangles: 24, vertices: 48, bytes: 100 });
  });
});

describe('file helpers', () => {
  it('detects supported extensions case-insensitively', () => {
    expect(extensionOf('Cat.GLB')).toBe('glb');
    expect(isSupportedModel('a.obj')).toBe(true);
    expect(isSupportedModel('a.fbx')).toBe(false);
    expect(isSupportedModel('noext')).toBe(false);
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('disposeObject', () => {
  it('disposes geometries and materials', () => {
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const gSpy = vi.spyOn(geometry, 'dispose');
    const mSpy = vi.spyOn(material, 'dispose');
    const g = new Group();
    g.add(new Mesh(geometry, material));
    disposeObject(g);
    expect(gSpy).toHaveBeenCalledOnce();
    expect(mSpy).toHaveBeenCalledOnce();
  });
});
