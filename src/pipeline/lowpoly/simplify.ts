import type { SourceMesh } from './types';

/** A mesh with its own tightly packed vertex arrays. */
export interface SimplifiedMesh {
  positions: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array | null;
  vertexColors: Float32Array | null;
}

export type Engine = 'meshoptimizer' | 'three' | 'clustering';

export interface SimplifyOptions {
  lockBorders: boolean;
  /** Test hook: skip engines before this one. */
  startAt?: Engine;
}

/** Copy only the vertices that `indices` still references, renumbering the indices. */
export function compact(
  indices: Uint32Array,
  positions: Float32Array,
  uvs: Float32Array | null,
  vertexColors: Float32Array | null,
): SimplifiedMesh {
  const remap = new Int32Array(positions.length / 3).fill(-1);
  let count = 0;
  const outIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (remap[v] < 0) remap[v] = count++;
    outIndices[i] = remap[v];
  }
  const outPos = new Float32Array(count * 3);
  const outUv = uvs ? new Float32Array(count * 2) : null;
  const outCol = vertexColors ? new Float32Array(count * 3) : null;
  for (let v = 0; v < remap.length; v++) {
    const n = remap[v];
    if (n < 0) continue;
    outPos.set(positions.subarray(v * 3, v * 3 + 3), n * 3);
    if (outUv && uvs) outUv.set(uvs.subarray(v * 2, v * 2 + 2), n * 2);
    if (outCol && vertexColors) outCol.set(vertexColors.subarray(v * 3, v * 3 + 3), n * 3);
  }
  return { positions: outPos, indices: outIndices, uvs: outUv, vertexColors: outCol };
}

// ---- engine 1: meshoptimizer (npm) -----------------------------------------

async function withMeshopt(mesh: SourceMesh, targetTris: number, opts: SimplifyOptions) {
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  if (!MeshoptSimplifier.supported) throw new Error('meshoptimizer is not supported here');

  // Weld vertices that share a position, so edges can collapse across texture seams.
  const remap = MeshoptSimplifier.generatePositionRemap(mesh.positions, 3);
  const welded = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < welded.length; i++) welded[i] = remap[mesh.indices[i]];

  const flags: ('LockBorder' | 'Permissive')[] = opts.lockBorders ? ['LockBorder'] : ['Permissive'];
  const target = Math.max(3, targetTris * 3);

  let result: Uint32Array;
  if (mesh.vertexColors) {
    // Colors steer the collapses, so color boundaries survive better.
    [result] = MeshoptSimplifier.simplifyWithAttributes(
      welded,
      mesh.positions,
      3,
      mesh.vertexColors,
      3,
      [0.4, 0.4, 0.4],
      null,
      target,
      1,
      flags,
    );
  } else {
    [result] = MeshoptSimplifier.simplify(welded, mesh.positions, 3, target, 1, flags);
  }

  // Some meshes get stuck above the target. Sloppy simplification reaches it reliably.
  if (result.length > target * 1.25) {
    [result] = MeshoptSimplifier.simplifySloppy(result, mesh.positions, 3, null, target, 1);
  }
  return compact(result, mesh.positions, mesh.uvs, mesh.vertexColors);
}

// ---- engine 2: three.js SimplifyModifier ------------------------------------

async function withThree(mesh: SourceMesh, targetTris: number): Promise<SimplifiedMesh> {
  const { BufferAttribute, BufferGeometry } = await import('three');
  const { SimplifyModifier } = await import('three/examples/jsm/modifiers/SimplifyModifier.js');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  if (mesh.uvs) geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  const vertexCount = mesh.positions.length / 3;
  const ratio = targetTris / (mesh.indices.length / 3);
  const remove = Math.floor(vertexCount * (1 - ratio));
  const out = await new SimplifyModifier().modify(geometry, remove);
  const index = out.getIndex();
  if (!index) throw new Error('SimplifyModifier returned no index');
  const uv = out.getAttribute('uv');
  return {
    positions: new Float32Array(out.getAttribute('position').array),
    indices: new Uint32Array(index.array),
    uvs: uv ? new Float32Array(uv.array) : null,
    // This engine does not carry vertex colors; the material color is used instead.
    vertexColors: null,
  };
}

// ---- engine 3: vertex clustering (plain JavaScript, always available) -------

/**
 * Merge vertices that fall in the same cell of a 3D grid, then drop triangles that collapse.
 * Rough, but it works without WebAssembly. The grid is refined until the target is reached.
 */
export function clusterSimplify(mesh: SourceMesh, targetTris: number): SimplifiedMesh {
  const { positions } = mesh;
  const n = positions.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i * 3 + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-9);

  let best: SimplifiedMesh | null = null;
  // Triangles grow roughly with the square of the grid size.
  let cells = Math.max(2, Math.round(Math.sqrt(targetTris / 2)));
  for (let attempt = 0; attempt < 14; attempt++) {
    const out = clusterOnce(mesh, extent, min, cells);
    const tris = out.indices.length / 3;
    best = out;
    if (tris >= targetTris * 0.8 && tris <= targetTris * 1.25) break;
    cells = Math.max(2, Math.round(cells * Math.sqrt(targetTris / Math.max(1, tris))));
    if (tris < targetTris * 0.8 && attempt > 8) break;
  }
  return best!;
}

function clusterOnce(
  mesh: SourceMesh,
  extent: number,
  min: number[],
  cells: number,
): SimplifiedMesh {
  const { positions, indices, uvs, vertexColors } = mesh;
  const n = positions.length / 3;
  const size = extent / cells;
  const cellOf = new Map<string, number>();
  const cluster = new Int32Array(n);
  const sums: number[][] = [];
  for (let i = 0; i < n; i++) {
    const key = [0, 1, 2]
      .map((a) => Math.min(cells - 1, Math.floor((positions[i * 3 + a] - min[a]) / size)))
      .join(',');
    let c = cellOf.get(key);
    if (c === undefined) {
      c = sums.length;
      cellOf.set(key, c);
      sums.push([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
    cluster[i] = c;
    const s = sums[c];
    s[0] += positions[i * 3];
    s[1] += positions[i * 3 + 1];
    s[2] += positions[i * 3 + 2];
    if (uvs) {
      s[3] += uvs[i * 2];
      s[4] += uvs[i * 2 + 1];
    }
    if (vertexColors) {
      s[5] += vertexColors[i * 3];
      s[6] += vertexColors[i * 3 + 1];
      s[7] += vertexColors[i * 3 + 2];
    }
    s[8] += 1;
  }

  const outPos = new Float32Array(sums.length * 3);
  const outUv = uvs ? new Float32Array(sums.length * 2) : null;
  const outCol = vertexColors ? new Float32Array(sums.length * 3) : null;
  sums.forEach((s, c) => {
    const k = s[8];
    outPos.set([s[0] / k, s[1] / k, s[2] / k], c * 3);
    if (outUv) outUv.set([s[3] / k, s[4] / k], c * 2);
    if (outCol) outCol.set([s[5] / k, s[6] / k, s[7] / k], c * 3);
  });

  const tris: number[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = cluster[indices[t]];
    const b = cluster[indices[t + 1]];
    const c = cluster[indices[t + 2]];
    if (a === b || b === c || a === c) continue;
    // Drop duplicate triangles that landed on the same three clusters.
    const sorted = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(sorted)) continue;
    seen.add(sorted);
    tris.push(a, b, c);
  }
  return compact(new Uint32Array(tris), outPos, outUv, outCol);
}

// ---- entry point -------------------------------------------------------------

const ORDER: Engine[] = ['meshoptimizer', 'three', 'clustering'];

/** Simplify to about `targetTris` triangles, trying each engine in turn. */
export async function simplifyMesh(
  mesh: SourceMesh,
  targetTris: number,
  opts: SimplifyOptions,
): Promise<{ mesh: SimplifiedMesh; engine: Engine }> {
  const tris = mesh.indices.length / 3;
  if (tris <= targetTris) {
    return {
      mesh: compact(mesh.indices, mesh.positions, mesh.uvs, mesh.vertexColors),
      engine: opts.startAt ?? 'meshoptimizer',
    };
  }
  const start = opts.startAt ? ORDER.indexOf(opts.startAt) : 0;
  let lastError: unknown;
  for (const engine of ORDER.slice(start)) {
    try {
      if (engine === 'meshoptimizer')
        return { mesh: await withMeshopt(mesh, targetTris, opts), engine };
      if (engine === 'three') return { mesh: await withThree(mesh, targetTris), engine };
      return { mesh: clusterSimplify(mesh, targetTris), engine };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Simplification failed');
}
