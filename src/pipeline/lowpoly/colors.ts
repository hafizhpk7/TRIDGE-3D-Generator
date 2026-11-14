import type { Rgb, SourceTexture } from './types';

/** Sample a texture at (u, v) with repeat wrapping and nearest filtering. Returns sRGB 0..1. */
export function sampleTexture(tex: SourceTexture, u: number, v: number): Rgb {
  const fu = u - Math.floor(u);
  const fv = v - Math.floor(v);
  const x = Math.min(tex.width - 1, Math.floor(fu * tex.width));
  const row = tex.flipY ? 1 - fv : fv;
  const y = Math.min(tex.height - 1, Math.max(0, Math.floor(row * tex.height)));
  const o = (y * tex.width + x) * 4;
  return [tex.data[o] / 255, tex.data[o + 1] / 255, tex.data[o + 2] / 255];
}

// ---- CIE Lab, so palette distances match what the eye sees -----------------

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
const finv = (t: number) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));

export function rgbToLab([r, g, b]: Rgb): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = 0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb;
  const fx = f(x / XN);
  const fy = f(y / YN);
  const fz = f(z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([l, a, b]: [number, number, number]): Rgb {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = finv(fx) * XN;
  const y = finv(fy) * YN;
  const z = finv(fz) * ZN;
  const lr = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const lb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

// ---- k-means ---------------------------------------------------------------

export interface Quantized {
  palette: Rgb[];
  /** Palette slot for each input color. */
  assignment: Uint8Array;
}

/** Small deterministic generator so the same model always gets the same palette. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist2 = (a: number[], b: number[]) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Reduce colors to `k` palette colors with k-means in Lab space (k-means++ start).
 * `weights` (for example triangle areas) make big faces count more.
 */
export function quantizeColors(
  colors: Rgb[],
  weights: number[] | null,
  k: number,
  iterations = 12,
): Quantized {
  const n = colors.length;
  const kk = Math.max(1, Math.min(k, 255, n));
  if (n === 0) return { palette: [], assignment: new Uint8Array(0) };

  const lab = colors.map(rgbToLab);
  const w = weights ?? new Array<number>(n).fill(1);
  const rand = mulberry32(1337);

  // k-means++ seeding
  const centers: number[][] = [lab[Math.floor(rand() * n)].slice()];
  const nearest = new Float64Array(n).fill(Infinity);
  while (centers.length < kk) {
    const last = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) {
      nearest[i] = Math.min(nearest[i], dist2(lab[i], last));
      total += nearest[i] * w[i];
    }
    if (total <= 0) break; // fewer distinct colors than k
    let target = rand() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      target -= nearest[i] * w[i];
      if (target <= 0) {
        pick = i;
        break;
      }
    }
    centers.push(lab[pick].slice());
  }

  const assignment = new Uint8Array(n);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(lab[i], centers[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        changed = true;
      }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const s = sums[assignment[i]];
      s[0] += lab[i][0] * w[i];
      s[1] += lab[i][1] * w[i];
      s[2] += lab[i][2] * w[i];
      s[3] += w[i];
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0)
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
    if (!changed && iter > 0) break;
  }

  return {
    palette: centers.map((c) => labToRgb(c as [number, number, number])),
    assignment,
  };
}

export function rgbToHex([r, g, b]: Rgb): string {
  const h = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
