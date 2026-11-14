import type { BgWorkerRequest, BgWorkerResponse } from '../../workers/bgRemoval.worker';

export interface BgProgress {
  stage: 'download' | 'run';
  /** 0..1; only meaningful for the download stage. */
  progress: number;
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/bgRemoval.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

/** Stop the worker (used for cancel). The downloaded model stays in the browser cache. */
export function cancelBackgroundRemoval() {
  worker?.terminate();
  worker = null;
}

export class BackgroundRemovalError extends Error {}

/** Removes the background in a worker. Resolves with the RGBA cutout at the input's size. */
export function removeBackground(
  blob: Blob,
  onProgress: (p: BgProgress) => void,
  signal?: AbortSignal,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextId++;

    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onMessage = (e: MessageEvent<BgWorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') onProgress({ stage: msg.stage, progress: msg.progress });
      else if (msg.type === 'done') {
        cleanup();
        resolve(new ImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height));
      } else {
        cleanup();
        reject(new BackgroundRemovalError(friendlyMessage(msg.message)));
      }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      cancelBackgroundRemoval();
      reject(new BackgroundRemovalError(friendlyMessage(e.message)));
    };
    const onAbort = () => {
      cleanup();
      cancelBackgroundRemoval();
      reject(new DOMException('Cancelled', 'AbortError'));
    };

    if (signal?.aborted) return onAbort();
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    const ortBase = new URL('ort/', document.baseURI).href;
    w.postMessage({ type: 'run', id, blob, ortBase } satisfies BgWorkerRequest);
  });
}

function friendlyMessage(raw: string): string {
  console.warn('[background removal]', raw);
  if (/fetch|network|load failed|failed to load/i.test(raw)) {
    return "Couldn't download the background remover. Check your connection and try again, or skip this step.";
  }
  if (/memory|alloc/i.test(raw)) {
    return 'The background remover ran out of memory. Try a smaller picture, or skip this step.';
  }
  return 'Background removal did not work on this picture. You can skip this step and use the picture as it is.';
}
