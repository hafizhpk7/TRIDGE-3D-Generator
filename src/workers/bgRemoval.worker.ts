/// <reference lib="webworker" />
import { pipeline, RawImage } from '@huggingface/transformers';
import { BG_MODEL_DTYPE, BG_MODEL_ID } from '../pipeline/input/config';
import { configureTransformers, downloadProgress } from './ortRuntime';

export type BgWorkerRequest = { type: 'run'; id: number; blob: Blob; ortBase: string };
export type BgWorkerResponse =
  | { type: 'progress'; id: number; stage: 'download' | 'run'; progress: number }
  | { type: 'done'; id: number; width: number; height: number; buffer: ArrayBuffer }
  | { type: 'error'; id: number; message: string };

type Segmenter = (input: RawImage) => Promise<RawImage>;
let segmenterPromise: Promise<Segmenter> | null = null;

function loadSegmenter(ortBase: string, report: (p: number) => void): Promise<Segmenter> {
  if (!segmenterPromise) {
    configureTransformers(ortBase);
    segmenterPromise = pipeline('background-removal', BG_MODEL_ID, {
      dtype: BG_MODEL_DTYPE,
      device: 'wasm',
      progress_callback: downloadProgress(report),
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
