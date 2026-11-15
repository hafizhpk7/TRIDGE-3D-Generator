import type { DepthWorkerRequest, DepthWorkerResponse } from '../../workers/depth.worker';

export interface DepthProgress {
  stage: 'download' | 'run';
  /** 0..1; only meaningful for the download stage. */
  progress: number;
}

export interface DepthMap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/depth.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

export function cancelDepthEstimation() {
  worker?.terminate();
  worker = null;
}

export class DepthError extends Error {}

/** Estimate depth for a picture in a worker. The model is downloaded once, then cached. */
export function estimateDepth(
  blob: Blob,
  onProgress: (p: DepthProgress) => void,
  signal?: AbortSignal,
): Promise<DepthMap> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextId++;
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onMessage = (e: MessageEvent<DepthWorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') onProgress({ stage: msg.stage, progress: msg.progress });
      else if (msg.type === 'done') {
        cleanup();
        resolve({ data: new Uint8ClampedArray(msg.buffer), width: msg.width, height: msg.height });
      } else {
        cleanup();
        reject(new DepthError(friendly(msg.message)));
      }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      cancelDepthEstimation();
      reject(new DepthError(friendly(e.message)));
    };
    const onAbort = () => {
      cleanup();
      cancelDepthEstimation();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    if (signal?.aborted) return onAbort();
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    const ortBase = new URL('ort/', document.baseURI).href;
    w.postMessage({ type: 'run', id, blob, ortBase } satisfies DepthWorkerRequest);
  });
}

function friendly(raw: string): string {
  console.warn('[depth]', raw);
  if (/fetch|network|load failed|failed to load/i.test(raw)) {
    return "Couldn't download the depth model. Check your connection and try again.";
  }
  if (/memory|alloc/i.test(raw)) return 'The depth model ran out of memory. Try a smaller picture.';
  return 'Depth estimation did not work on this picture.';
}
