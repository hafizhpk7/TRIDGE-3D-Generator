import { describe, expect, it } from 'vitest';
import { alphaBounds, centerPlacement } from './alpha';
import { clampCrop, cropRect, initialCrop, panCrop } from './crop';
import { validateImageFile } from './validate';

describe('validateImageFile', () => {
  const ok = { name: 'cat.png', type: 'image/png', size: 1000 };
  it('accepts png, jpg and webp', () => {
    expect(validateImageFile(ok)).toBeNull();
    expect(validateImageFile({ ...ok, type: 'image/jpeg' })).toBeNull();
    expect(validateImageFile({ ...ok, type: 'image/webp' })).toBeNull();
  });
  it('rejects other types and oversize files with a next step', () => {
    expect(validateImageFile({ ...ok, type: 'image/gif' })).toMatch(/PNG, JPG or WEBP/);
    expect(validateImageFile({ ...ok, size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(validateImageFile({ ...ok, size: 0 })).toMatch(/empty/);
  });
});

describe('crop', () => {
  it('starts as the largest centered square', () => {
    expect(cropRect(initialCrop(), 800, 600)).toEqual({ sx: 100, sy: 0, size: 600 });
  });

  it('shrinks the square when zooming', () => {
    const r = cropRect({ zoom: 2, cx: 0.5, cy: 0.5 }, 800, 600);
    expect(r.size).toBe(300);
    expect(r.sx).toBe(250);
    expect(r.sy).toBe(150);
  });

  it('keeps the square inside the image', () => {
    const c = clampCrop({ zoom: 2, cx: 0, cy: 1 }, 800, 600);
    const r = cropRect(c, 800, 600);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy + r.size).toBeLessThanOrEqual(600 + 1e-9);
  });

  it('clamps zoom to its range', () => {
    expect(clampCrop({ zoom: 99, cx: 0.5, cy: 0.5 }, 100, 100).zoom).toBe(4);
    expect(clampCrop({ zoom: 0.1, cx: 0.5, cy: 0.5 }, 100, 100).zoom).toBe(1);
  });

  it('pans opposite to the drag direction', () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 };
    const moved = panCrop(start, 50, 0, 300, 800, 600);
    expect(moved.cx).toBeLessThan(0.5);
    expect(moved.cy).toBe(0.5);
  });

  it('cannot pan a full-size square along its short axis', () => {
    const moved = panCrop(initialCrop(), 0, 80, 300, 800, 600);
    expect(moved.cy).toBe(0.5);
  });
});

describe('alpha helpers', () => {
  function image(w: number, h: number, filled: Array<[number, number]>) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of filled) data[(y * w + x) * 4 + 3] = 255;
    return data;
  }

  it('finds the bounding box of opaque pixels', () => {
    const data = image(10, 10, [
      [2, 3],
      [6, 7],
    ]);
    expect(alphaBounds(data, 10, 10)).toEqual({ x: 2, y: 3, width: 5, height: 5 });
  });

  it('returns null for a fully transparent image', () => {
    expect(alphaBounds(new Uint8ClampedArray(16 * 4), 4, 4)).toBeNull();
  });

  it('centers and scales a cutout to the fill ratio', () => {
    const p = centerPlacement({ x: 0, y: 0, width: 100, height: 50 }, 512, 0.8);
    expect(p.dw).toBeCloseTo(409.6);
    expect(p.dh).toBeCloseTo(204.8);
    expect(p.dx).toBeCloseTo((512 - 409.6) / 2);
    expect(p.dy).toBeCloseTo((512 - 204.8) / 2);
  });
});
