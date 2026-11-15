import type { CraftWorkerRequest, CraftWorkerResponse } from '../../workers/craft.worker';
import type { ShapeSpec } from '../spec/types';
import type { BuiltCraft, BuildOptions } from './build';

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/craft.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

/**
 * Build in a worker. Later calls do not cancel earlier ones, but callers can ignore stale results
 * by comparing the returned `id` with the newest one they asked for.
 */
export function buildInWorker(
  spec: ShapeSpec,
  options: BuildOptions,
): { id: number; result: Promise<BuiltCraft> } {
  const w = getWorker();
  const id = nextId++;
  const result = new Promise<BuiltCraft>((resolve, reject) => {
    const onMessage = (e: MessageEvent<CraftWorkerResponse>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (e.data.ok) resolve(e.data.built);
      else reject(new Error(e.data.message));
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      worker?.terminate();
      worker = null;
      reject(new Error(e.message || 'The model builder stopped unexpectedly.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, spec, options } satisfies CraftWorkerRequest);
  });
  return { id, result };
}
