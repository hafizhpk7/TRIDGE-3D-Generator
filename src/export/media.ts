import type { Sequencer } from '../animate/player';
import type { ViewerEngine } from '../viewer/ViewerEngine';
import type { GifRequest, GifResponse } from '../workers/gif.worker';
import { videoBitrate } from './estimates';

/** How long a video or GIF of the current timeline should run. With nothing to play, the model turns around. */
export const TURNTABLE_SECONDS = 6;
export const MAX_GIF_FRAMES = 150;

export function clipLength(total: number, speed: number, hasSteps: boolean): number {
  if (!hasSteps || total <= 0) return TURNTABLE_SECONDS;
  return Math.max(0.5, total / Math.max(0.1, speed));
}

export function canRecordVideo(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/** The best WebM flavour this browser can write, or null when it cannot write WebM at all. */
export function pickWebmType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

export interface MediaOptions {
  maxSide: number;
  transparent: boolean;
  fps: number;
  /** Swing the camera around while it plays. Always on when there is no animation. */
  turntable: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
  }
}

/** Remember where the camera and timeline were so they can be put back after a capture. */
function saveView(engine: ViewerEngine, seq: Sequencer) {
  const pos = engine.camera.position.clone();
  const target = engine.controls.target.clone();
  const time = seq.time;
  const loop = seq.loop;
  return () => {
    engine.camera.position.copy(pos);
    engine.controls.target.copy(target);
    engine.controls.update();
    seq.loop = loop;
    seq.pause();
    seq.seek(time);
  };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Record the viewer as a WebM video, playing the timeline once (or turning the model if there is none). */
export async function recordWebm(
  engine: ViewerEngine,
  seq: Sequencer,
  opts: MediaOptions,
): Promise<Blob> {
  const mime = pickWebmType();
  if (!mime || !canRecordVideo()) throw new Error('This browser cannot record video.');
  const hasSteps = seq.total > 0;
  const seconds = clipLength(seq.total, seq.speed, hasSteps);
  const restore = saveView(engine, seq);
  engine.beginCapture({ maxSide: opts.maxSide, transparent: opts.transparent });
  let stopSpin: (() => void) | null = null;
  try {
    const canvas = engine.renderer.domElement;
    const stream = canvas.captureStream(opts.fps);
    const pixels = canvas.width * canvas.height;
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: videoBitrate(pixels),
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('The recording failed.'));
    });

    seq.pause();
    seq.loop = false;
    seq.seek(0);
    if (opts.turntable || !hasSteps) {
      const rate = (Math.PI * 2) / (hasSteps ? Math.max(seconds, TURNTABLE_SECONDS) : seconds);
      stopSpin = engine.addTicker((dt) => engine.orbitBy(rate * dt));
    }
    recorder.start(250);
    if (hasSteps) seq.play();

    const started = performance.now();
    while (performance.now() - started < seconds * 1000 + 300) {
      if (opts.signal?.aborted) {
        recorder.stop();
        await done.catch(() => undefined);
        throw new CancelledError();
      }
      opts.onProgress?.(Math.min(1, (performance.now() - started) / (seconds * 1000)));
      await wait(100);
    }
    recorder.stop();
    await done;
    opts.onProgress?.(1);
    return new Blob(chunks, { type: 'video/webm' });
  } finally {
    stopSpin?.();
    engine.endCapture();
    restore();
  }
}

function spawnGifWorker(): Worker {
  return new Worker(new URL('../workers/gif.worker.ts', import.meta.url), { type: 'module' });
}

/** Render the timeline frame by frame and pack it as an animated GIF. The encoding runs in a worker. */
export async function renderGif(
  engine: ViewerEngine,
  seq: Sequencer,
  opts: MediaOptions,
): Promise<Blob> {
  const hasSteps = seq.total > 0;
  const seconds = clipLength(seq.total, seq.speed, hasSteps);
  const frameCount = Math.max(2, Math.min(MAX_GIF_FRAMES, Math.round(seconds * opts.fps)));
  // when frames had to be dropped, slow the playback down a little so the length stays right
  const fps = frameCount / seconds;
  const restore = saveView(engine, seq);
  engine.beginCapture({ maxSide: opts.maxSide, transparent: opts.transparent });
  const buffers: ArrayBuffer[] = [];
  let width = 0;
  let height = 0;
  try {
    const canvas = engine.renderer.domElement;
    width = canvas.width;
    height = canvas.height;
    const flat = document.createElement('canvas');
    flat.width = width;
    flat.height = height;
    const ctx = flat.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not read the picture back.');
    seq.pause();
    seq.loop = false;
    const spin = opts.turntable || !hasSteps;
    for (let i = 0; i < frameCount; i++) {
      if (opts.signal?.aborted) throw new CancelledError();
      if (hasSteps) seq.seek(Math.min(seq.total, (i / frameCount) * seq.total));
      if (spin && i > 0) engine.orbitBy((Math.PI * 2) / frameCount);
      engine.renderNow();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(canvas, 0, 0);
      buffers.push(ctx.getImageData(0, 0, width, height).data.buffer);
      opts.onProgress?.((i + 1) / frameCount / 1.25);
      // let the page breathe so the progress bar keeps moving
      if (i % 4 === 3) await wait(0);
    }
  } finally {
    engine.endCapture();
    restore();
  }

  const worker = spawnGifWorker();
  try {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const onAbort = () => reject(new CancelledError());
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (e: MessageEvent<GifResponse>) => {
        opts.signal?.removeEventListener('abort', onAbort);
        if (e.data.ok) resolve(e.data.bytes);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The GIF encoder stopped unexpectedly.'));
      const req: GifRequest = { width, height, buffers, fps, transparent: opts.transparent };
      worker.postMessage(req, buffers);
    });
    opts.onProgress?.(1);
    return new Blob([bytes as BlobPart], { type: 'image/gif' });
  } finally {
    worker.terminate();
  }
}
