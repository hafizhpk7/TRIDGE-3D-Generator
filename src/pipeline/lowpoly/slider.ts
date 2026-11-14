export const MIN_TRIANGLES = 300;
export const MAX_TRIANGLES = 20000;

export const PRESETS = [
  { id: 'ultra', label: 'Ultra low', triangles: 300 },
  { id: 'low', label: 'Low', triangles: 800 },
  { id: 'medium', label: 'Medium', triangles: 3000 },
] as const;

/** Slider position (0..100) to a triangle count on a log scale, rounded to a tidy number. */
export function sliderToTriangles(v: number): number {
  const t = Math.min(100, Math.max(0, v)) / 100;
  const raw = MIN_TRIANGLES * Math.pow(MAX_TRIANGLES / MIN_TRIANGLES, t);
  const step = raw < 1000 ? 10 : raw < 5000 ? 50 : 100;
  return Math.min(MAX_TRIANGLES, Math.max(MIN_TRIANGLES, Math.round(raw / step) * step));
}

export function trianglesToSlider(triangles: number): number {
  const clamped = Math.min(MAX_TRIANGLES, Math.max(MIN_TRIANGLES, triangles));
  return (Math.log(clamped / MIN_TRIANGLES) / Math.log(MAX_TRIANGLES / MIN_TRIANGLES)) * 100;
}
