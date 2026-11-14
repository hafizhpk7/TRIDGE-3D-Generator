/// <reference lib="webworker" />
import { resultBuffers, runLowPoly } from '../pipeline/lowpoly/process';
import type { WorkerRequest, WorkerResponse } from '../pipeline/lowpoly/types';

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, source, settings } = e.data;
  const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
    self.postMessage(msg, { transfer });
  try {
    const result = await runLowPoly(source, settings, (stage) =>
      post({ type: 'progress', id, stage }),
    );
    post({ type: 'done', id, result }, resultBuffers(result));
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
