/// <reference lib="webworker" />
import type { Frame } from '../rig/frame';
import { computeSkinWeights, type SkinBone, type SkinResult } from '../rig/skin';

export interface SkinMeshInput {
  positions: Float32Array;
  indices: Uint32Array | null;
}

export type SkinWorkerRequest = {
  id: number;
  meshes: SkinMeshInput[];
  bones: SkinBone[];
  frame: Frame;
};
export type SkinWorkerResponse =
  { id: number; ok: true; results: SkinResult[] } | { id: number; ok: false; message: string };

self.onmessage = (e: MessageEvent<SkinWorkerRequest>) => {
  const { id, meshes, bones, frame } = e.data;
  try {
    const results = meshes.map((m) => computeSkinWeights({ ...m, bones, frame }));
    const transfer = results.flatMap((r) => [
      r.skinIndices.buffer,
      r.skinWeights.buffer,
    ]) as ArrayBuffer[];
    self.postMessage({ id, ok: true, results } satisfies SkinWorkerResponse, { transfer });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    } satisfies SkinWorkerResponse);
  }
};
