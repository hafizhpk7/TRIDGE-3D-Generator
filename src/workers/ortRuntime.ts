import { env } from '@huggingface/transformers';

/** Settings shared by every worker that runs a Transformers.js model. */
export function configureTransformers(ortBase: string) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
  if (!onnx.wasm) return;
  // Serve the ONNX runtime from our own origin instead of a CDN (files live in public/ort/).
  onnx.wasm.wasmPaths = {
    mjs: ortBase + 'ort-wasm-simd-threaded.mjs',
    wasm: ortBase + 'ort-wasm-simd-threaded.wasm',
  };
  // Cross-origin isolation is not available on static hosts, so stay single-threaded.
  onnx.wasm.numThreads = 1;
}

type ProgressEvent = { status: string; file?: string; loaded?: number; total?: number };

/** Combine per-file download events into one 0..1 number. */
export function downloadProgress(report: (p: number) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (e: ProgressEvent) => {
    if (e.status !== 'progress' || !e.file || !e.total) return;
    files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    report(total ? loaded / total : 0);
  };
}
