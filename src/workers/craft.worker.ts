/// <reference lib="webworker" />
import { buildCraft, type BuiltCraft, type BuildOptions } from '../craft/builder/build';
import type { ShapeSpec } from '../craft/spec/types';

export type CraftWorkerRequest = { id: number; spec: ShapeSpec; options: BuildOptions };
export type CraftWorkerResponse =
  { id: number; ok: true; built: BuiltCraft } | { id: number; ok: false; message: string };

self.onmessage = (e: MessageEvent<CraftWorkerRequest>) => {
  const { id, spec, options } = e.data;
  try {
    const built = buildCraft(spec, options);
    const transfer = [
      built.positions.buffer,
      built.normals.buffer,
      built.colors.buffer,
      built.skinIndices.buffer,
      built.skinWeights.buffer,
    ] as ArrayBuffer[];
    self.postMessage({ id, ok: true, built } satisfies CraftWorkerResponse, { transfer });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    } satisfies CraftWorkerResponse);
  }
};
