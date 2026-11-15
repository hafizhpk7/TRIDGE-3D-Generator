import type { SkinWorkerRequest, SkinWorkerResponse, SkinMeshInput } from '../workers/skin.worker';
import type { Frame } from './frame';
import type { SkinBone, SkinResult } from './skin';

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/skin.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

/** Compute skin weights for every mesh in a worker, so the page never freezes. */
export function skinInWorker(
  meshes: SkinMeshInput[],
  bones: SkinBone[],
  frame: Frame,
): Promise<SkinResult[]> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e: MessageEvent<SkinWorkerResponse>) => {
      if (e.data.id !== id) return;
      cleanup();
      if (e.data.ok) resolve(e.data.results);
      else reject(new Error(e.data.message));
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      worker?.terminate();
      worker = null;
      reject(new Error(e.message || 'The skinning worker stopped unexpectedly.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, meshes, bones, frame } satisfies SkinWorkerRequest);
  });
}
