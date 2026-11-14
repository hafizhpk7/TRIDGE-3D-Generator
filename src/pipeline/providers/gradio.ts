import type { Client } from '@gradio/client';
import { classifyError, isGlb, ProviderError } from './errors';
import type { Progress } from './types';

/** Hard cap for one generation, including queue time. */
export const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

type Client_ = Client;
/** Named parameters, or a positional list for endpoints whose API description is incomplete. */
type Payload = Record<string, unknown> | unknown[];

export interface SpaceSession {
  /** Call an endpoint and return its output array. */
  call(endpoint: string, payload: Payload, onProgress?: (p: Progress) => void): Promise<unknown[]>;
  /** Wrap a blob so the Gradio client uploads it. */
  file(blob: Blob): Promise<unknown>;
  close(): void;
}

function toProgress(status: {
  stage: string;
  position?: number;
  size?: number;
  eta?: number;
}): Progress | null {
  if (status.stage === 'pending') {
    return {
      phase: 'queued',
      queuePosition: status.position,
      queueSize: status.size,
      etaSeconds: status.eta,
    };
  }
  if (status.stage === 'generating') return { phase: 'generating', etaSeconds: status.eta };
  return null;
}

/**
 * Open a session on a public Space. The Gradio client is loaded on demand so it stays out
 * of the main bundle. Errors are classified into ProviderError values.
 */
export async function openSpace(
  space: string,
  token: string | undefined,
  signal: AbortSignal,
): Promise<SpaceSession> {
  const { Client, handle_file } = await import('@gradio/client');
  let client: Client_;
  try {
    client = await Client.connect(space, {
      token: token && token.startsWith('hf_') ? (token as `hf_${string}`) : undefined,
      // Keep uploaded pictures and results out of this browser's saved history.
      record_history: false,
    });
  } catch (e) {
    throw classifyError(signal.aborted ? new DOMException('Cancelled', 'AbortError') : e);
  }

  /** One submit. Resolves to null when the event stream closes without delivering any result. */
  const attempt = async (
    endpoint: string,
    payload: Payload,
    onProgress?: (p: Progress) => void,
  ): Promise<unknown[] | null> => {
    const job = client.submit(endpoint, payload);
    const onAbort = () => void job.cancel();
    signal.addEventListener('abort', onAbort);
    let result: unknown[] | null = null;
    try {
      for await (const msg of job) {
        if (import.meta.env.DEV) {
          const m = msg as { type: string; stage?: string; message?: unknown };
          console.debug(
            '[gradio]',
            endpoint,
            m.type,
            m.stage ?? '',
            typeof m.message === 'string' ? m.message : '',
          );
        }
        if (msg.type === 'status') {
          if (msg.stage === 'error') {
            throw new Error(
              typeof msg.message === 'string' ? `${msg.title ?? ''} ${msg.message}` : 'Space error',
            );
          }
          const p = toProgress(msg);
          if (p) onProgress?.(p);
        } else if (msg.type === 'data') {
          result = msg.data as unknown[];
        }
      }
    } catch (e) {
      throw classifyError(signal.aborted ? new DOMException('Cancelled', 'AbortError') : e);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    return result;
  };

  const call: SpaceSession['call'] = async (endpoint, payload, onProgress) => {
    if (signal.aborted) throw new ProviderError('cancelled');
    const result = await attempt(endpoint, payload, onProgress);
    if (result) return result;
    if (signal.aborted) throw new ProviderError('cancelled');

    // The client's event stream can end silently when the Space rejects a job (for example when the
    // free GPU quota is used up). predict() reports the real reason, so ask once more that way.
    if (import.meta.env.DEV)
      console.debug('[gradio]', endpoint, 'empty stream, asking via predict');
    try {
      const res = await client.predict(endpoint, payload);
      return res.data as unknown[];
    } catch (e) {
      throw classifyError(signal.aborted ? new DOMException('Cancelled', 'AbortError') : e);
    }
  };

  return {
    call,
    file: async (blob) => handle_file(blob),
    close: () => client.close(),
  };
}

/** Dig a file URL out of a Gradio output, which may be wrapped in an update object. */
export function fileUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    const o = output as { url?: unknown; value?: unknown };
    if (typeof o.url === 'string') return o.url;
    if (o.value !== undefined) return fileUrl(o.value);
  }
  return null;
}

/** First output that points at a .glb file. */
export function findGlbOutput(outputs: unknown[]): unknown {
  return outputs.find((o) => /\.glb($|\?)/i.test(fileUrl(o) ?? ''));
}

/** Download a result file and check that it really is a GLB. */
export async function downloadGlb(
  output: unknown,
  token: string | undefined,
  signal: AbortSignal,
): Promise<Blob> {
  const url = fileUrl(output);
  if (!url) throw new ProviderError('bad-output', 'No file URL in output');
  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: token && token.startsWith('hf_') ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (e) {
    throw classifyError(e);
  }
  if (!res.ok) throw new ProviderError('offline', `Download failed (${res.status})`);
  const buffer = await res.arrayBuffer();
  if (!isGlb(buffer)) throw new ProviderError('bad-output', 'File is not a GLB');
  return new Blob([buffer], { type: 'model/gltf-binary' });
}
