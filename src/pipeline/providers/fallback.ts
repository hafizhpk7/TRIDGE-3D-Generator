import { classifyError, ProviderError, summarizeFailures } from './errors';
import type { GenOptions, ImageTo3DProvider, Progress, ProviderStatus } from './types';

export interface FallbackCallbacks {
  onStart?: (provider: ImageTo3DProvider) => void;
  onProgress?: (provider: ImageTo3DProvider, p: Progress) => void;
  /** Called when a provider failed and the next one is about to start. */
  onFallback?: (failed: ImageTo3DProvider, error: ProviderError, next: ImageTo3DProvider) => void;
}

export interface FallbackResult {
  glb: Blob;
  provider: ImageTo3DProvider;
}

/** Providers worth trying first: online and unknown before busy, offline last. Stable within a rank. */
export function orderProviders(
  providers: ImageTo3DProvider[],
  statuses: Record<string, ProviderStatus | undefined>,
  preferredId?: string,
): ImageTo3DProvider[] {
  const rank = (s: ProviderStatus | undefined) =>
    s === 'online' ? 0 : s === 'busy' ? 2 : s === 'offline' ? 3 : 1;
  const sorted = providers
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(statuses[a.p.id]) - rank(statuses[b.p.id]) || a.i - b.i)
    .map((x) => x.p);
  if (!preferredId) return sorted;
  const preferred = sorted.find((p) => p.id === preferredId);
  return preferred ? [preferred, ...sorted.filter((p) => p !== preferred)] : sorted;
}

/**
 * Try each provider in order until one returns a GLB.
 * Cancellation stops immediately; any other failure moves on to the next provider.
 */
export async function generateWithFallback(args: {
  providers: ImageTo3DProvider[];
  image: Blob;
  opts: GenOptions;
  signal: AbortSignal;
  callbacks?: FallbackCallbacks;
}): Promise<FallbackResult> {
  const { providers, image, opts, signal, callbacks } = args;
  const errors: ProviderError[] = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    if (signal.aborted) throw new ProviderError('cancelled');
    callbacks?.onStart?.(provider);
    try {
      const glb = await provider.generate(
        image,
        opts,
        (p) => callbacks?.onProgress?.(provider, p),
        signal,
      );
      return { glb, provider };
    } catch (e) {
      const err = classifyError(e);
      if (err.kind === 'cancelled' || signal.aborted) throw new ProviderError('cancelled');
      console.warn(`[${provider.id}] ${err.kind}`, err.detail);
      errors.push(err);
      const next = providers[i + 1];
      if (next) callbacks?.onFallback?.(provider, err, next);
    }
  }
  throw summarizeFailures(errors);
}
