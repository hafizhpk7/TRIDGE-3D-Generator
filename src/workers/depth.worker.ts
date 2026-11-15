/// <reference lib="webworker" />
import { pipeline, RawImage } from '@huggingface/transformers';
import { DEPTH_MODEL_DTYPE, DEPTH_MODEL_ID } from '../pipeline/relief/config';
import { configureTransformers, downloadProgress } from './ortRuntime';

export type DepthWorkerRequest = { type: 'run'; id: number; blob: Blob; ortBase: string };
export type DepthWorkerResponse =
  | { type: 'progress'; id: number; stage: 'download' | 'run'; progress: number }
  | { type: 'done'; id: number; width: number; height: number; buffer: ArrayBuffer }
  | { type: 'error'; id: number; message: string };

type Estimator = (input: RawImage) => Promise<{ depth: RawImage }>;
let estimatorPromise: Promise<Estimator> | null = null;

function loadEstimator(ortBase: string, report: (p: number) => void): Promise<Estimator> {
  if (!estimatorPromise) {
    configureTransformers(ortBase);
    estimatorPromise = pipeline('depth-estimation', DEPTH_MODEL_ID, {
      dtype: DEPTH_MODEL_DTYPE,
      device: 'wasm',
      progress_callback: downloadProgress(report),
    }).then((p) => p as unknown as Estimator);
    estimatorPromise.catch(() => {
      estimatorPromise = null;
    });
  }
  return estimatorPromise;
}

self.onmessage = async (e: MessageEvent<DepthWorkerRequest>) => {
  const { id, blob, ortBase } = e.data;
  const post = (msg: DepthWorkerResponse, transfer: Transferable[] = []) =>
    self.postMessage(msg, { transfer });
  try {
    const estimator = await loadEstimator(ortBase, (p) =>
      post({ type: 'progress', id, stage: 'download', progress: p }),
    );
    post({ type: 'progress', id, stage: 'run', progress: 0 });
    // Depth models expect RGB, so flatten any transparency onto white first.
    const image = (await RawImage.fromBlob(blob)).rgb();
    const { depth } = await estimator(image);
    // 8-bit grayscale, brighter = closer, resized back to the input size.
    const gray = depth.channels === 1 ? depth : depth.grayscale();
    const copy = new Uint8ClampedArray(gray.data).buffer;
    post({ type: 'done', id, width: gray.width, height: gray.height, buffer: copy }, [copy]);
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
