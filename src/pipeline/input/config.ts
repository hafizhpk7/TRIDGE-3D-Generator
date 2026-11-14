/** Square size (px) sent to image-to-3D providers. Providers can override this in a later phase. */
export const PROVIDER_IMAGE_SIZE = 512;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Background removal model.
 * onnx-community/ormbg-ONNX is an ISNet-based general-purpose model (not portrait-only),
 * licensed Apache-2.0. The 8-bit variant is about 44 MB and is cached by the browser after the first run.
 */
export const BG_MODEL_ID = 'onnx-community/ormbg-ONNX';
export const BG_MODEL_DTYPE = 'q8';
export const BG_MODEL_SIZE_LABEL = '44 MB';

/** How much of the square the cutout fills after re-centering. */
export const CUTOUT_FILL = 0.88;
