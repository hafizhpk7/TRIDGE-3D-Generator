import type { ProviderStatus } from './types';

/** Map a Hugging Face Space runtime stage to a status chip. */
export function stageToStatus(stage: string | undefined): ProviderStatus {
  switch (stage) {
    case 'RUNNING':
      return 'online';
    case 'SLEEPING':
    case 'BUILDING':
    case 'RUNNING_BUILDING':
    case 'APP_STARTING':
    case 'STARTING':
      return 'busy';
    case undefined:
      return 'unknown';
    default:
      // PAUSED, STOPPED, NO_APP_FILE, CONFIG_ERROR, BUILD_ERROR, RUNTIME_ERROR, DELETING...
      return 'offline';
  }
}

/** Ask the public Hugging Face API for a Space's current stage. No token needed. */
export async function checkSpace(spaceId: string, signal?: AbortSignal): Promise<ProviderStatus> {
  const timeout = AbortSignal.timeout(8000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetch(`https://huggingface.co/api/spaces/${spaceId}`, { signal: combined });
    if (!res.ok) return res.status === 404 ? 'offline' : 'unknown';
    const json = (await res.json()) as { runtime?: { stage?: string } };
    return stageToStatus(json.runtime?.stage);
  } catch {
    return 'unknown';
  }
}
