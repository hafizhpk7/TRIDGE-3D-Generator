import { ProviderError, classifyError } from '../providers/errors';
import { openSpace, type SpaceSession } from '../providers/gradio';
import { checkSpace } from '../providers/spaceStatus';
import type { Progress, ProviderStatus } from '../providers/types';
import { downloadImage } from './image';

export interface TextToImageOptions {
  token?: string;
}

export interface BatchResult {
  /** How many pictures were made. */
  made: number;
  /** Why it stopped early, if it did. */
  error: ProviderError | null;
}

export interface TextToImageProvider {
  id: string;
  name: string;
  license: string;
  typicalWait: string;
  healthCheck(signal?: AbortSignal): Promise<ProviderStatus>;
  /**
   * Make up to `count` pictures on one connection, reporting each as soon as it is ready.
   * Throws if the very first picture fails, so the caller can try another provider.
   * Later failures (for example a quota running out) end the batch with what was made.
   */
  generateBatch(
    prompt: string,
    count: number,
    opts: TextToImageOptions,
    onImage: (file: File, index: number) => void,
    onProgress: (p: Progress) => void,
    signal: AbortSignal,
  ): Promise<BatchResult>;
}

const BATCH_TIMEOUT_MS = 6 * 60 * 1000;
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

async function runBatch(args: {
  space: string;
  name: string;
  count: number;
  opts: TextToImageOptions;
  signal: AbortSignal;
  onImage: (file: File, index: number) => void;
  onProgress: (p: Progress) => void;
  callOne: (session: SpaceSession, onProgress: (p: Progress) => void) => Promise<unknown[]>;
}): Promise<BatchResult> {
  const { count, opts, signal } = args;
  const timeout = AbortSignal.timeout(BATCH_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeout]);
  const asTimeout = (e: unknown) =>
    timeout.aborted && !signal.aborted ? new ProviderError('timeout') : classifyError(e);

  args.onProgress({ phase: 'connecting' });
  let session: SpaceSession;
  try {
    session = await openSpace(args.space, opts.token, combined);
  } catch (e) {
    throw asTimeout(e);
  }

  let made = 0;
  try {
    for (let i = 0; i < count; i++) {
      const out = await args.callOne(session, args.onProgress);
      args.onProgress({ phase: 'downloading' });
      const file = await downloadImage(out, opts.token, combined, `${args.name}-${i + 1}`);
      args.onImage(file, i);
      made++;
    }
    return { made, error: null };
  } catch (e) {
    const err = asTimeout(e);
    if (made === 0) throw err;
    return { made, error: err };
  } finally {
    session.close();
  }
}

/**
 * FLUX.1 [schnell] on Black Forest Labs' Space.
 * Verified 2026-11: stage RUNNING on ZeroGPU; model license Apache-2.0; about 3 seconds per picture.
 * Endpoint /infer: prompt, seed, randomize_seed, width, height, num_inference_steps.
 */
export const fluxProvider: TextToImageProvider = {
  id: 'flux-schnell',
  name: 'FLUX.1 schnell',
  license: 'Apache-2.0 license',
  typicalWait: 'a few seconds per picture',
  healthCheck: (signal) => checkSpace('black-forest-labs/FLUX.1-schnell', signal),
  generateBatch: (prompt, count, opts, onImage, onProgress, signal) =>
    runBatch({
      space: 'black-forest-labs/FLUX.1-schnell',
      name: 'flux',
      count,
      opts,
      signal,
      onImage,
      onProgress,
      callOne: (session, progress) =>
        session.call(
          '/infer',
          {
            prompt,
            seed: randomSeed(),
            randomize_seed: true,
            // Smaller than the Space's default: faster, and plenty for a 512 px input.
            width: 768,
            height: 768,
            num_inference_steps: 4,
          },
          progress,
        ),
    }),
};

/**
 * Z-Image Turbo on Tongyi-MAI's Space.
 * Verified 2026-11: stage RUNNING on ZeroGPU; model license Apache-2.0; about 10 seconds per picture.
 * Endpoint /generate: prompt, resolution, seed, steps, shift, random_seed, gallery_images.
 */
export const zImageProvider: TextToImageProvider = {
  id: 'z-image-turbo',
  name: 'Z-Image Turbo',
  license: 'Apache-2.0 license',
  typicalWait: 'about 10 seconds per picture',
  healthCheck: (signal) => checkSpace('Tongyi-MAI/Z-Image-Turbo', signal),
  generateBatch: (prompt, count, opts, onImage, onProgress, signal) =>
    runBatch({
      space: 'Tongyi-MAI/Z-Image-Turbo',
      name: 'zimage',
      count,
      opts,
      signal,
      onImage,
      onProgress,
      callOne: (session, progress) =>
        session.call(
          '/generate',
          {
            prompt,
            resolution: '1024x1024 ( 1:1 )',
            seed: randomSeed(),
            steps: 8,
            shift: 3,
            random_seed: true,
            gallery_images: [],
          },
          progress,
        ),
    }),
};

export const TEXT_PROVIDERS: TextToImageProvider[] = [fluxProvider, zImageProvider];
