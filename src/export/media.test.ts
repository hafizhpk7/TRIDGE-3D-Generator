import { describe, expect, it } from 'vitest';
import { captureDims, gifEstimate, pngEstimate, videoBitrate, webmEstimate } from './estimates';
import { encodeGif } from './gifEncode';
import { MAX_GIF_FRAMES, TURNTABLE_SECONDS, clipLength } from './media';

describe('capture sizes', () => {
  it('scales the view so the long side hits the target', () => {
    expect(captureDims({ w: 800, h: 400 }, 1600)).toEqual({ w: 1600, h: 800 });
    expect(captureDims({ w: 400, h: 800 }, 1600)).toEqual({ w: 800, h: 1600 });
  });
  it('uses the fallback ratio when no size is given', () => {
    expect(captureDims({ w: 500, h: 300 }, undefined, 2)).toEqual({ w: 1000, h: 600 });
  });
});

describe('estimates', () => {
  it('keeps the video bitrate within sane limits', () => {
    expect(videoBitrate(1000)).toBe(1_500_000);
    expect(videoBitrate(1280 * 720)).toBe(4_608_000);
    expect(videoBitrate(8_000_000)).toBe(12_000_000);
  });
  it('grows with size and length', () => {
    expect(pngEstimate(1920, 1080)).toBeGreaterThan(pngEstimate(960, 540));
    expect(webmEstimate(1280, 720, 6)).toBeGreaterThan(webmEstimate(1280, 720, 3));
    expect(gifEstimate(480, 360, 90)).toBeGreaterThan(gifEstimate(480, 360, 45));
  });
});

describe('clipLength', () => {
  it('turns the model around when there is nothing to play', () => {
    expect(clipLength(0, 1, false)).toBe(TURNTABLE_SECONDS);
  });
  it('follows the timeline and the playback speed', () => {
    expect(clipLength(4, 1, true)).toBe(4);
    expect(clipLength(4, 2, true)).toBe(2);
    expect(MAX_GIF_FRAMES).toBeGreaterThan(30);
  });
});

/** Read the logical screen size and frame count out of a GIF. */
function inspect(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.slice(0, 6));
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  let frames = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    // a graphic control extension starts every frame
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) frames++;
  }
  return {
    header,
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
    frames,
    hasLoop: new TextDecoder().decode(bytes).includes('NETSCAPE2.0'),
  };
}

function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set(rgba, i * 4);
  return a;
}

describe('encodeGif', () => {
  it('writes a looping GIF with every frame', () => {
    const bytes = encodeGif({
      width: 8,
      height: 6,
      fps: 15,
      transparent: false,
      frames: [
        solid(8, 6, [255, 0, 0, 255]),
        solid(8, 6, [0, 255, 0, 255]),
        solid(8, 6, [0, 0, 255, 255]),
      ],
    });
    const g = inspect(bytes);
    expect(g.header).toBe('GIF89a');
    expect(g.width).toBe(8);
    expect(g.height).toBe(6);
    expect(g.frames).toBe(3);
    expect(g.hasLoop).toBe(true);
  });

  it('handles large frames, where only some pixels are sampled for the palette', () => {
    // odd sizes make the per-frame sample count round up, which once overflowed the sample buffer
    const frames = Array.from({ length: 10 }, (_, i) => solid(301, 301, [i * 20, 100, 200, 255]));
    const bytes = encodeGif({ width: 301, height: 301, fps: 15, transparent: false, frames });
    expect(inspect(bytes).frames).toBe(10);
  });

  it('keeps see-through pixels see-through', () => {
    const half = solid(4, 4, [0, 0, 0, 0]);
    for (let i = 0; i < 8; i++) half.set([200, 50, 50, 255], i * 4);
    const bytes = encodeGif({
      width: 4,
      height: 4,
      fps: 10,
      transparent: true,
      frames: [half, half],
    });
    // the graphic control extension's packed byte has the transparency flag in its lowest bit
    let flagged = false;
    for (let i = 0; i < bytes.length - 4; i++)
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && (bytes[i + 3] & 1) === 1) flagged = true;
    expect(flagged).toBe(true);
  });
});
