/**
 * Depth estimation model for the 2.5D relief fallback.
 * onnx-community/depth-anything-v2-small: Depth Anything V2 Small, Apache-2.0.
 * (The larger Depth Anything V2 sizes are CC BY-NC, so they are not used.)
 * The 8-bit variant is about 27 MB and is cached by the browser after the first run.
 */
export const DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small';
export const DEPTH_MODEL_DTYPE = 'q8';
export const DEPTH_MODEL_SIZE_LABEL = '27 MB';

/** Grid cells along each side of the relief mesh. */
export const RELIEF_GRID = 96;
/** Relief height as a fraction of the picture width. */
export const RELIEF_DEPTH = 0.35;
