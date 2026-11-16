/// <reference lib="webworker" />
import { encodeGif, type GifFrames } from '../export/gifEncode';

export interface GifRequest {
  width: number;
  height: number;
  /** Raw RGBA buffers, one per frame (transferred, not copied). */
  buffers: ArrayBuffer[];
  fps: number;
  transparent: boolean;
}

export type GifResponse = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

self.onmessage = (e: MessageEvent<GifRequest>) => {
  try {
    const { width, height, buffers, fps, transparent } = e.data;
    const input: GifFrames = {
      width,
      height,
      fps,
      transparent,
      frames: buffers.map((b) => new Uint8ClampedArray(b)),
    };
    const bytes = encodeGif(input);
    const reply: GifResponse = { ok: true, bytes };
    (self as unknown as Worker).postMessage(reply, [bytes.buffer]);
  } catch (err) {
    const reply: GifResponse = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(reply);
  }
};
