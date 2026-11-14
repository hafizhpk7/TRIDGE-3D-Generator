import { checkSpace } from './spaceStatus';
import { downloadGlb, findGlbOutput, openSpace, GENERATION_TIMEOUT_MS } from './gradio';
import { ProviderError } from './errors';
import type { ImageTo3DProvider } from './types';

/**
 * Stable Fast 3D on Stability AI's Space.
 * Verified 2026-11: stage RUNNING on ZeroGPU, Gradio 4.41, about 4 seconds for a cut-out picture.
 * License: Stability AI Community License. Free for individuals and organizations under
 * US$1M annual revenue; larger organizations need a separate license.
 *
 * The Space is a stateful UI, so it must be driven in the same order as its page:
 *   1. /requires_bg_remove  checks the picture and stores it in the session
 *   2. /run_button "Remove Background"  only when the picture has no transparency
 *   3. /run_button "Run"  makes the model
 * /run_button hides its button input from the API description, so the payload is positional:
 * [button label, picture, foreground ratio, remesh option, vertex count, texture size].
 */
const SPACE = 'stabilityai/stable-fast-3d';
const FOREGROUND_RATIO = 0.85;

function buttonLabel(update: unknown): string | undefined {
  if (update && typeof update === 'object') {
    const v = (update as { value?: unknown }).value;
    if (typeof v === 'string') return v;
  }
  return undefined;
}

export const stableFast3dProvider: ImageTo3DProvider = {
  id: 'sf3d',
  name: 'Stable Fast 3D',
  license: 'Stability AI Community License (free under US$1M revenue)',
  typicalWait: 'under a minute',

  healthCheck: (signal) => checkSpace(SPACE, signal),

  async generate(image, opts, onProgress, signal) {
    const timeout = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
    const combined = AbortSignal.any([signal, timeout]);
    onProgress({ phase: 'connecting' });
    const session = await openSpace(SPACE, opts.token, combined).catch((e) => {
      throw timeout.aborted && !signal.aborted ? new ProviderError('timeout') : e;
    });
    try {
      const file = await session.file(image);
      const run = (label: 'Run' | 'Remove Background') =>
        session.call('/run_button', [label, file, FOREGROUND_RATIO, 'None', -1, 1024], onProgress);

      const check = await session.call('/requires_bg_remove', {
        image: file,
        fr: FOREGROUND_RATIO,
      });
      if (buttonLabel(check[0]) === 'Remove Background') await run('Remove Background');
      const out = await run('Run');

      onProgress({ phase: 'downloading' });
      return await downloadGlb(findGlbOutput(out), opts.token, combined);
    } catch (e) {
      throw timeout.aborted && !signal.aborted ? new ProviderError('timeout') : e;
    } finally {
      session.close();
    }
  },
};
