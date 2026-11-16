export type ImageSize = 'screen' | 'hd' | '4k';
export type VideoSize = '720' | '1080';
export type GifSize = '320' | '480' | '640';

export const IMAGE_SIZES: { id: ImageSize; label: string; maxSide?: number }[] = [
  { id: 'screen', label: 'As on screen' },
  { id: 'hd', label: 'HD (1920)', maxSide: 1920 },
  { id: '4k', label: '4K (3840)', maxSide: 3840 },
];
export const VIDEO_SIZES: { id: VideoSize; label: string; maxSide: number }[] = [
  { id: '720', label: '720p (1280)', maxSide: 1280 },
  { id: '1080', label: '1080p (1920)', maxSide: 1920 },
];
export const GIF_SIZES: { id: GifSize; label: string; maxSide: number }[] = [
  { id: '320', label: 'Small (320)', maxSide: 320 },
  { id: '480', label: 'Medium (480)', maxSide: 480 },
  { id: '640', label: 'Large (640)', maxSide: 640 },
];

/** Pixel size of a capture of a view of `view`, drawn at up to `maxSide` pixels on the long side. */
export function captureDims(
  view: { w: number; h: number },
  maxSide: number | undefined,
  fallbackRatio = 1,
): { w: number; h: number } {
  const k = maxSide ? maxSide / Math.max(view.w, view.h) : fallbackRatio;
  return { w: Math.max(1, Math.round(view.w * k)), h: Math.max(1, Math.round(view.h * k)) };
}

/** Bits per second the video recorder asks for: enough for crisp flat colours, never huge. */
export function videoBitrate(pixels: number): number {
  return Math.round(Math.min(12_000_000, Math.max(1_500_000, pixels * 5)));
}

// The three estimates below are rough: how well a picture compresses depends on what is in it.
export const pngEstimate = (w: number, h: number) => Math.round(w * h * 0.06);
export const webmEstimate = (w: number, h: number, seconds: number) =>
  Math.round((videoBitrate(w * h) * seconds) / 8);
export const gifEstimate = (w: number, h: number, frames: number) =>
  Math.round(w * h * frames * 0.09);
