import { describe, expect, it } from 'vitest';
import { BoxGeometry, SphereGeometry } from 'three';
import { hexToRgb, labToRgb, quantizeColors, rgbToHex, rgbToLab, sampleTexture } from './colors';
import { buildFlatMesh } from './flatten';
import { countTriangles, runLowPoly, splitBudget } from './process';
import { MAX_TRIANGLES, MIN_TRIANGLES, sliderToTriangles, trianglesToSlider } from './slider';
import { clusterSimplify, compact, simplifyMesh } from './simplify';
import type { LowPolySettings, Rgb, SourceData, SourceMesh } from './types';

function sphereMesh(widthSeg = 64, heightSeg = 48, withColors = false): SourceMesh {
  const g = new SphereGeometry(1, widthSeg, heightSeg);
  const positions = new Float32Array(g.getAttribute('position').array);
  const colors = withColors ? new Float32Array(positions.length) : null;
  if (colors)
    for (let i = 0; i < positions.length / 3; i++)
      colors.set(positions[i * 3 + 1] > 0 ? [1, 0, 0] : [0, 0, 1], i * 3);
  return {
    positions,
    indices: new Uint32Array(g.getIndex()!.array),
    uvs: new Float32Array(g.getAttribute('uv').array),
    vertexColors: colors,
    baseColor: [1, 1, 1],
    textureId: -1,
  };
}

const settings = (over: Partial<LowPolySettings> = {}): LowPolySettings => ({
  targetTriangles: 500,
  colorMode: 'faces',
  paletteSize: 6,
  lockBorders: false,
  ...over,
});

describe('slider mapping', () => {
  it('covers the chunky to detailed range', () => {
    expect(sliderToTriangles(0)).toBe(MIN_TRIANGLES);
    expect(sliderToTriangles(100)).toBe(MAX_TRIANGLES);
    expect(sliderToTriangles(50)).toBeGreaterThan(MIN_TRIANGLES);
    expect(sliderToTriangles(50)).toBeLessThan(MAX_TRIANGLES);
  });
  it('round-trips closely', () => {
    for (const t of [300, 800, 3000, 20000]) {
      expect(sliderToTriangles(trianglesToSlider(t))).toBe(t);
    }
  });
  it('is monotonic', () => {
    let prev = 0;
    for (let v = 0; v <= 100; v += 5) {
      const t = sliderToTriangles(v);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe('colors', () => {
  it('round-trips sRGB through Lab', () => {
    const c: Rgb = [0.8, 0.3, 0.5];
    const back = labToRgb(rgbToLab(c));
    c.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 2));
  });

  it('converts hex both ways', () => {
    expect(rgbToHex([1, 0.5, 0])).toBe('#ff8000');
    expect(hexToRgb('#ff8000')[0]).toBe(1);
    expect(hexToRgb('nonsense')).toEqual([0, 0, 0]);
  });

  it('finds the colors in a clearly clustered set', () => {
    const colors: Rgb[] = [];
    for (let i = 0; i < 30; i++) colors.push([1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const q = quantizeColors(colors, null, 3);
    expect(q.palette).toHaveLength(3);
    const distinct = new Set(Array.from(q.assignment));
    expect(distinct.size).toBe(3);
    // each palette color is close to one of the inputs
    for (const p of q.palette) {
      const near = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ].some((t) => Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]) < 0.15);
      expect(near).toBe(true);
    }
  });

  it('is deterministic and handles fewer colors than slots', () => {
    const colors: Rgb[] = [
      [1, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
    ];
    const a = quantizeColors(colors, null, 8);
    const b = quantizeColors(colors, null, 8);
    expect(a.palette).toEqual(b.palette);
    expect(a.palette.length).toBeLessThanOrEqual(3);
  });

  it('samples textures with wrapping and flipping', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const tex = { width: 2, height: 2, data, flipY: false };
    expect(sampleTexture(tex, 0.1, 0.1)).toEqual([1, 0, 0]);
    expect(sampleTexture(tex, 1.1, 0.1)).toEqual([1, 0, 0]);
    expect(sampleTexture({ ...tex, flipY: true }, 0.1, 0.1)).toEqual([0, 0, 1]);
  });
});

describe('compact', () => {
  it('drops unused vertices and renumbers', () => {
    const out = compact(
      new Uint32Array([2, 3, 4]),
      new Float32Array(15).map((_, i) => i),
      null,
      null,
    );
    expect(out.positions).toHaveLength(9);
    expect(Array.from(out.indices)).toEqual([0, 1, 2]);
    expect(Array.from(out.positions.subarray(0, 3))).toEqual([6, 7, 8]);
  });
});

describe('buildFlatMesh', () => {
  it('writes face normals, areas and colors', () => {
    const positions = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const { mesh, areas } = buildFlatMesh(
      { positions, indices: new Uint32Array([0, 1, 2]), uvs: null, vertexColors: null },
      { baseColor: [0.5, 0.25, 1], texture: null },
    );
    expect(Array.from(mesh.normals.subarray(0, 3))).toEqual([0, 0, 1]);
    expect(areas[0]).toBeCloseTo(2);
    expect(Array.from(mesh.faceColors)).toEqual([0.5, 0.25, 1]);
  });

  it('averages vertex colors per face', () => {
    const { mesh } = buildFlatMesh(
      {
        positions: new Float32Array(9),
        indices: new Uint32Array([0, 1, 2]),
        uvs: null,
        vertexColors: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0]),
      },
      { baseColor: [1, 1, 1], texture: null },
    );
    expect(mesh.faceColors[0]).toBeCloseTo(1 / 3);
  });
});

describe('simplifyMesh', () => {
  const dense = sphereMesh();
  const denseTris = dense.indices.length / 3;

  it('starts from a dense mesh', () => {
    expect(denseTris).toBeGreaterThan(5000);
  });

  it('reduces to about the target with meshoptimizer', async () => {
    const { mesh, engine } = await simplifyMesh(dense, 500, { lockBorders: false });
    expect(engine).toBe('meshoptimizer');
    const tris = mesh.indices.length / 3;
    expect(tris).toBeLessThan(700);
    expect(tris).toBeGreaterThan(200);
  });

  it('works with the three.js fallback', async () => {
    const { mesh, engine } = await simplifyMesh(dense, 500, {
      lockBorders: false,
      startAt: 'three',
    });
    expect(engine).toBe('three');
    expect(mesh.indices.length / 3).toBeLessThan(denseTris / 4);
  });

  it('works with plain clustering and never emits bad indices', async () => {
    const out = clusterSimplify(dense, 500);
    const tris = out.indices.length / 3;
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThan(1200);
    const verts = out.positions.length / 3;
    for (const i of out.indices) expect(i).toBeLessThan(verts);
  });

  it('leaves small meshes alone', async () => {
    const box = new BoxGeometry();
    const small: SourceMesh = {
      positions: new Float32Array(box.getAttribute('position').array),
      indices: new Uint32Array(box.getIndex()!.array),
      uvs: null,
      vertexColors: null,
      baseColor: [1, 1, 1],
      textureId: -1,
    };
    const { mesh } = await simplifyMesh(small, 500, { lockBorders: false });
    expect(mesh.indices.length / 3).toBe(12);
  });
});

describe('runLowPoly', () => {
  const source = (m: SourceMesh): SourceData => ({ meshes: [m], textures: [] });

  it('splits budgets in proportion', () => {
    expect(splitBudget([1000, 3000], 400)).toEqual([100, 300]);
    expect(splitBudget([100, 100], 1000)).toEqual([100, 100]);
  });

  it('makes a flat-shaded model near 500 triangles', async () => {
    const src = source(sphereMesh());
    const r = await runLowPoly(src, settings());
    expect(r.sourceTriangles).toBe(countTriangles(src));
    expect(r.triangles).toBeLessThan(750);
    const m = r.meshes[0];
    expect(m.positions.length).toBe(r.triangles * 9);
    expect(m.normals.length).toBe(r.triangles * 9);
    expect(m.faceColors.length).toBe(r.triangles * 3);
  });

  it('reduces to a palette of the requested size', async () => {
    const src = source(sphereMesh(64, 48, true));
    const r = await runLowPoly(src, settings({ colorMode: 'palette', paletteSize: 6 }));
    expect(r.palette).not.toBeNull();
    expect(r.palette!.length).toBeLessThanOrEqual(6);
    const m = r.meshes[0];
    expect(m.paletteIndex).not.toBeNull();
    const used = new Set<string>();
    for (let f = 0; f < r.triangles; f++) {
      used.add(
        Array.from(m.faceColors.subarray(f * 3, f * 3 + 3))
          .map((v) => v.toFixed(4))
          .join(','),
      );
    }
    expect(used.size).toBeLessThanOrEqual(6);
    // top red, bottom blue survive as two separate colors
    expect(used.size).toBeGreaterThanOrEqual(2);
  });

  it('reports the engine that did the work', async () => {
    const r = await runLowPoly(source(sphereMesh()), settings());
    expect(r.engine).toBe('meshoptimizer');
  });
});
