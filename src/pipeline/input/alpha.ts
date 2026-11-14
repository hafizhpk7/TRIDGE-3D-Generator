export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box of pixels whose alpha is above `threshold`, or null if the image is empty. */
export function alphaBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 24,
): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Where to draw a `bounds`-sized cutout inside a `canvasSize` square so it is centered
 * and fills `fill` of the square (never scaled up past the point where it would overflow).
 */
export function centerPlacement(bounds: Bounds, canvasSize: number, fill: number) {
  const scale = (canvasSize * fill) / Math.max(bounds.width, bounds.height);
  const w = bounds.width * scale;
  const h = bounds.height * scale;
  return { dx: (canvasSize - w) / 2, dy: (canvasSize - h) / 2, dw: w, dh: h };
}
