/// <reference lib="webworker" />
import { env, pipeline, RawImage } from '@huggingface/transformers';
import { BG_MODEL_DTYPE, BG_MODEL_ID } from '../pipeline/input/config';

export type BgWorkerRequest = { type: 'run'; id: number; blob: Blob; ortBase: string };
export type BgWorkerResponse =
  | { type: 'progress'; id: number; stage: 'download' | 'run'; progress: number }
  | { type: 'done'; id: number; width: number; height: number; buffer: ArrayBuffer }
  | { type: 'error'; id: number; message: string };

env.allowLocalModels = false;
env.useBrowserCache = true;
function configureRuntime(ortBase: string) {
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

type Segmenter = (input: RawImage) => Promise<RawImage>;
let segmenterPromise: Promise<Segmenter> | null = null;

function loadSegmenter(ortBase: string, report: (p: number) => void): Promise<Segmenter> {
  if (!segmenterPromise) {
    configureRuntime(ortBase);
    const files = new Map<string, { loaded: number; total: number }>();
    segmenterPromise = pipeline('background-removal', BG_MODEL_ID, {
      dtype: BG_MODEL_DTYPE,
      device: 'wasm',
      progress_callback: (e: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (e.status === 'progress' && e.file && e.total) {
          files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          report(total ? loaded / total : 0);
        }
      },
    }).then((p) => p as unknown as Segmenter);
    // Let a failed download be retried.
    segmenterPromise.catch(() => {
      segmenterPromise = null;
    });
  }
  return segmenterPromise;
}

self.onmessage = async (e: MessageEvent<BgWorkerRequest>) => {
  const { id, blob, ortBase } = e.data;
  const post = (msg: BgWorkerResponse, transfer: Transferable[] = []) =>
    self.postMessage(msg, { transfer });
  try {
    const segmenter = await loadSegmenter(ortBase, (p) =>
      post({ type: 'progress', id, stage: 'download', progress: p }),
    );
    post({ type: 'progress', id, stage: 'run', progress: 0 });
    const image = await RawImage.fromBlob(blob);
    const out = await segmenter(image);
    const rgba = out.channels === 4 ? out : out.rgba();
    const copy = new Uint8ClampedArray(rgba.data).buffer;
    post({ type: 'done', id, width: rgba.width, height: rgba.height, buffer: copy }, [copy]);
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
