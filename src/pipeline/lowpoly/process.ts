import { quantizeColors } from './colors';
import { buildFlatMesh } from './flatten';
import { simplifyMesh, type Engine } from './simplify';
import type { LowPolyResult, LowPolySettings, ResultMesh, Rgb, SourceData } from './types';

const ENGINE_RANK: Record<Engine, number> = { meshoptimizer: 0, three: 1, clustering: 2 };

export function countTriangles(source: SourceData): number {
  return source.meshes.reduce((sum, m) => sum + m.indices.length / 3, 0);
}

/** Split a triangle budget across meshes in proportion to their size. */
export function splitBudget(counts: number[], target: number): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= target) return counts.slice();
  return counts.map((c) => Math.min(c, Math.max(4, Math.round((target * c) / total))));
}

/** The whole low-poly job. Runs inside a worker, but has no worker-only dependencies. */
export async function runLowPoly(
  source: SourceData,
  settings: LowPolySettings,
  onStage: (stage: string) => void = () => undefined,
): Promise<LowPolyResult> {
  const counts = source.meshes.map((m) => m.indices.length / 3);
  const budgets = splitBudget(counts, settings.targetTriangles);
  let engine: Engine = 'meshoptimizer';

  const meshes: ResultMesh[] = [];
  const areas: Float32Array[] = [];
  for (let i = 0; i < source.meshes.length; i++) {
    const src = source.meshes[i];
    onStage(`Simplifying part ${i + 1} of ${source.meshes.length}`);
    const simplified = await simplifyMesh(src, budgets[i], { lockBorders: settings.lockBorders });
    if (ENGINE_RANK[simplified.engine] > ENGINE_RANK[engine]) engine = simplified.engine;

    onStage('Flattening facets and coloring');
    const texture = src.textureId >= 0 ? source.textures[src.textureId] : null;
    const built = buildFlatMesh(simplified.mesh, { baseColor: src.baseColor, texture });
    meshes.push(built.mesh);
    areas.push(built.areas);
  }

  let palette: Rgb[] | null = null;
  if (settings.colorMode === 'palette') {
    onStage('Picking palette colors');
    const colors: Rgb[] = [];
    const weights: number[] = [];
    meshes.forEach((m, mi) => {
      for (let f = 0; f < m.faceColors.length / 3; f++) {
        colors.push([m.faceColors[f * 3], m.faceColors[f * 3 + 1], m.faceColors[f * 3 + 2]]);
        weights.push(areas[mi][f]);
      }
    });
    const q = quantizeColors(colors, weights, settings.paletteSize);
    palette = q.palette;
    let cursor = 0;
    for (const m of meshes) {
      const faces = m.faceColors.length / 3;
      const index = new Uint8Array(faces);
      for (let f = 0; f < faces; f++) {
        const slot = q.assignment[cursor++];
        index[f] = slot;
        const c = palette[slot];
        m.faceColors[f * 3] = c[0];
        m.faceColors[f * 3 + 1] = c[1];
        m.faceColors[f * 3 + 2] = c[2];
      }
      m.paletteIndex = index;
    }
  }

  return {
    meshes,
    palette,
    sourceTriangles: counts.reduce((a, b) => a + b, 0),
    triangles: meshes.reduce((s, m) => s + m.positions.length / 9, 0),
    engine,
  };
}

/** All typed-array buffers in a result, for zero-copy transfer out of a worker. */
export function resultBuffers(result: LowPolyResult): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const m of result.meshes) {
    out.push(
      m.positions.buffer as ArrayBuffer,
      m.normals.buffer as ArrayBuffer,
      m.faceColors.buffer as ArrayBuffer,
    );
    if (m.uvs) out.push(m.uvs.buffer as ArrayBuffer);
    if (m.paletteIndex) out.push(m.paletteIndex.buffer as ArrayBuffer);
  }
  return out;
}
