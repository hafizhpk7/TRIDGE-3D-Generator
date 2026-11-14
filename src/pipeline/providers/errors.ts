export type ProviderErrorKind =
  'quota' | 'offline' | 'timeout' | 'cancelled' | 'bad-output' | 'failed';

const MESSAGES: Record<ProviderErrorKind, string> = {
  quota: 'Free GPU quota reached. Try again later or use the other provider.',
  offline:
    "That free server isn't answering. It may be asleep or down, so try again in a minute or use the other provider.",
  timeout: 'The free server took too long. Try again, or use the other provider.',
  cancelled: 'Cancelled.',
  'bad-output':
    'The server sent back something that is not a 3D model. Try again or use the other provider.',
  failed:
    'The free server could not make a model from this picture. Try a clearer picture or the other provider.',
};

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    /** Raw technical detail for the console. Must never contain tokens. */
    readonly detail = '',
  ) {
    super(MESSAGES[kind]);
    this.name = 'ProviderError';
  }

  /** Whether trying a different provider could help. */
  get retryable() {
    return this.kind !== 'cancelled';
  }
}

const QUOTA = /quota|exceeded your|zerogpu|rate.?limit|too many requests|\b429\b/i;
const OFFLINE =
  /not found|\b404\b|\b50[234]\b|sleeping|paused|building|starting|runtime error|failed to fetch|network|load failed|could not (connect|resolve)|space metadata|no_app_file|config_error|err_/i;
const TIMEOUT = /time.?out|timed out|deadline/i;

/** Turn anything thrown by a Gradio call into a ProviderError. */
export function classifyError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new ProviderError('cancelled');
  const text = errorText(e);
  if (QUOTA.test(text)) return new ProviderError('quota', text);
  if (TIMEOUT.test(text)) return new ProviderError('timeout', text);
  if (OFFLINE.test(text)) return new ProviderError('offline', text);
  return new ProviderError('failed', text);
}

function errorText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; detail?: unknown; title?: unknown };
    const parts = [o.title, o.message, o.detail].filter((x): x is string => typeof x === 'string');
    if (parts.length) return parts.join(' ');
    try {
      return JSON.stringify(e);
    } catch {
      return '';
    }
  }
  return String(e);
}

/** Summary error when every provider failed: favors the most actionable reason. */
export function summarizeFailures(errors: ProviderError[]): ProviderError {
  const order: ProviderErrorKind[] = ['quota', 'timeout', 'offline', 'bad-output', 'failed'];
  for (const kind of order) {
    const hit = errors.find((e) => e.kind === kind);
    if (hit) return hit;
  }
  return new ProviderError('failed');
}

/** True when the buffer starts with the binary glTF magic number. */
export function isGlb(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  return new DataView(buffer).getUint32(0, true) === 0x46546c67; // "glTF"
}
