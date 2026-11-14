import { stableFast3dProvider } from './stableFast3d';
import { trellisProvider } from './trellis';
import type { ImageTo3DProvider } from './types';

/** Default order: best quality first, then the faster fallback. */
export const PROVIDERS: ImageTo3DProvider[] = [trellisProvider, stableFast3dProvider];

export type { ImageTo3DProvider, GenOptions, Progress, ProviderStatus } from './types';
export { ProviderError } from './errors';
export { generateWithFallback, orderProviders } from './fallback';
