import { checkSpace } from './spaceStatus';
import { downloadGlb, findGlbOutput, openSpace, GENERATION_TIMEOUT_MS } from './gradio';
import { ProviderError } from './errors';
import type { ImageTo3DProvider } from './types';

/**
 * TRELLIS (image-to-3D) on a community Space.
 * Verified 2026-11: stage RUNNING on ZeroGPU, Gradio 5.34, endpoint /generate_and_extract_glb.
 * License: model and code MIT.
 */
const SPACE = 'trellis-community/TRELLIS';

export const trellisProvider: ImageTo3DProvider = {
  id: 'trellis',
  name: 'TRELLIS',
  license: 'MIT license',
  typicalWait: 'about 1 to 2 minutes',

  healthCheck: (signal) => checkSpace(SPACE, signal),

  async generate(image, opts, onProgress, signal) {
    const timeout = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
    const combined = AbortSignal.any([signal, timeout]);
    onProgress({ phase: 'connecting' });
    const session = await openSpace(SPACE, opts.token, combined).catch((e) => {
      throw timeout.aborted && !signal.aborted ? new ProviderError('timeout') : e;
    });
    try {
      // The Space keeps per-session scratch folders; opening the session first is what its page does.
      await session.call('/start_session', {}).catch(() => undefined);

      // Cleans up the picture (crops to the object, resizes). Cheap and runs without a GPU.
      const prepared = await session.call('/preprocess_image', {
        image: await session.file(image),
      });

      const out = await session.call(
        '/generate_and_extract_glb',
        {
          image: prepared[0],
          multiimages: [],
          seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
          ss_guidance_strength: 7.5,
          ss_sampling_steps: 12,
          slat_guidance_strength: 3,
          slat_sampling_steps: 12,
          multiimage_algo: 'stochastic',
          // Keep the file small; the low-poly step reduces it further.
          mesh_simplify: 0.95,
          texture_size: 1024,
        },
        onProgress,
      );

      onProgress({ phase: 'downloading' });
      // outputs: [preview video, extracted GLB, download GLB]; take the first .glb
      return await downloadGlb(findGlbOutput(out), opts.token, combined);
    } catch (e) {
      throw timeout.aborted && !signal.aborted ? new ProviderError('timeout') : e;
    } finally {
      session.close();
    }
  },
};
