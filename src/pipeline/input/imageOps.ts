import { alphaBounds, centerPlacement } from './alpha';
import { CUTOUT_FILL } from './config';
import { cropRect, type CropState } from './crop';

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export async function decodeImage(file: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    throw new Error("That picture couldn't be opened. It may be damaged, so try another copy.");
  }
}

function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/** Draw the cropped square of `image` into a new `size` x `size` canvas. */
export function renderCrop(image: DecodedImage, crop: CropState, size: number): HTMLCanvasElement {
  const { sx, sy, size: src } = cropRect(crop, image.width, image.height);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.bitmap, sx, sy, src, src, 0, 0, size, size);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), type),
  );
}

/** Put a cutout on a transparent square, centered and scaled to fill most of it. */
export function centerCutout(cutout: ImageData, size: number): HTMLCanvasElement {
  const src = makeCanvas(1);
  src.width = cutout.width;
  src.height = cutout.height;
  src.getContext('2d')!.putImageData(cutout, 0, 0);

  const out = makeCanvas(size);
  const bounds = alphaBounds(cutout.data, cutout.width, cutout.height);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (!bounds) {
    ctx.drawImage(src, 0, 0, size, size);
    return out;
  }
  const p = centerPlacement(bounds, size, CUTOUT_FILL);
  ctx.drawImage(src, bounds.x, bounds.y, bounds.width, bounds.height, p.dx, p.dy, p.dw, p.dh);
  return out;
}

/** True if the cutout kept almost nothing (or almost everything), which means removal likely failed. */
export function cutoutLooksWrong(cutout: ImageData): boolean {
  let opaque = 0;
  const total = cutout.width * cutout.height;
  for (let i = 3; i < cutout.data.length; i += 4) if (cutout.data[i] > 24) opaque++;
  const ratio = opaque / total;
  return ratio < 0.02;
}

/** Resize any canvas to a square output of `size`. */
export function resizeSquare(source: HTMLCanvasElement, size: number): HTMLCanvasElement {
  if (source.width === size && source.height === size) return source;
  const out = makeCanvas(size);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size, size);
  return out;
}
