/**
 * Square crop model. `cx`/`cy` are the crop center as a fraction (0..1) of the image,
 * `zoom` is 1 for the largest possible square and grows as the crop shrinks.
 */
export interface CropState {
  zoom: number;
  cx: number;
  cy: number;
}

export interface CropRect {
  sx: number;
  sy: number;
  size: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const initialCrop = (): CropState => ({ zoom: 1, cx: 0.5, cy: 0.5 });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep zoom in range and the square fully inside the image. */
export function clampCrop(state: CropState, imgW: number, imgH: number): CropState {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  const size = Math.min(imgW, imgH) / zoom;
  const halfX = size / 2 / imgW;
  const halfY = size / 2 / imgH;
  return {
    zoom,
    cx: clamp(state.cx, halfX, 1 - halfX),
    cy: clamp(state.cy, halfY, 1 - halfY),
  };
}

export function cropRect(state: CropState, imgW: number, imgH: number): CropRect {
  const c = clampCrop(state, imgW, imgH);
  const size = Math.min(imgW, imgH) / c.zoom;
  return {
    sx: c.cx * imgW - size / 2,
    sy: c.cy * imgH - size / 2,
    size,
  };
}

/**
 * Move the crop by a pointer drag measured in preview pixels.
 * Dragging right drags the picture right, so the crop window moves left.
 */
export function panCrop(
  state: CropState,
  dxPx: number,
  dyPx: number,
  previewSize: number,
  imgW: number,
  imgH: number,
): CropState {
  const { size } = cropRect(state, imgW, imgH);
  const srcPerPx = size / previewSize;
  return clampCrop(
    {
      ...state,
      cx: state.cx - (dxPx * srcPerPx) / imgW,
      cy: state.cy - (dyPx * srcPerPx) / imgH,
    },
    imgW,
    imgH,
  );
}
