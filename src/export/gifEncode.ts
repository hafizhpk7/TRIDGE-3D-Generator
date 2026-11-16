import { GIFEncoder, applyPalette, quantize } from 'gifenc';

export interface GifFrames {
  width: number;
  height: number;
  /** One RGBA buffer per frame. */
  frames: Uint8ClampedArray[];
  /** Frames per second. */
  fps: number;
  /** Treat nearly invisible pixels as see-through. GIF only has on or off, no soft edges. */
  transparent: boolean;
}

/**
 * Turn frames into an animated GIF. One palette is made from all frames together, so colours do not flicker
 * and the file stays small. The animation repeats forever.
 */
export function encodeGif(input: GifFrames): Uint8Array {
  const { width, height, frames, fps, transparent } = input;
  const format = transparent ? 'rgba4444' : 'rgb565';

  // Sample some pixels from every frame to choose the shared palette.
  const step = Math.max(1, Math.floor((width * height * frames.length) / 400_000));
  const perFrame = Math.ceil((width * height) / step);
  const sample = new Uint8ClampedArray(perFrame * frames.length * 4);
  let at = 0;
  for (const frame of frames) {
    for (let p = 0; p < width * height; p += step) {
      sample.set(frame.subarray(p * 4, p * 4 + 4), at);
      at += 4;
    }
  }
  const palette = quantize(sample.subarray(0, at), 256, {
    format,
    ...(transparent ? { oneBitAlpha: 128 } : {}),
  });
  const transparentIndex = transparent ? palette.findIndex((c) => c[3] === 0) : -1;

  const gif = GIFEncoder();
  const delay = Math.max(20, Math.round(1000 / fps));
  frames.forEach((frame, i) => {
    const index = applyPalette(frame, palette, format);
    gif.writeFrame(index, width, height, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: 0,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: transparent ? 2 : 0,
    });
  });
  gif.finish();
  return gif.bytes();
}
