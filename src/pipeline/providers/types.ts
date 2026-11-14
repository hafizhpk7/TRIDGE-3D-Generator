export type ProviderStatus = 'online' | 'busy' | 'offline' | 'unknown';

export interface GenOptions {
  /** The user's own free Hugging Face token. Improves GPU quota. Never log this. */
  token?: string;
  /** True when the input image already has a transparent background. */
  backgroundRemoved: boolean;
  seed?: number;
}

export interface Progress {
  phase: 'connecting' | 'queued' | 'generating' | 'downloading';
  /** 0-based position in the queue (0 = next up). */
  queuePosition?: number;
  queueSize?: number;
  etaSeconds?: number;
}

export interface ImageTo3DProvider {
  id: string;
  name: string;
  /** Short, human-readable license summary shown in the UI. */
  license: string;
  /** Rough expectation for the user, e.g. "about a minute". */
  typicalWait: string;
  healthCheck(signal?: AbortSignal): Promise<ProviderStatus>;
  generate(
    image: Blob,
    opts: GenOptions,
    onProgress: (p: Progress) => void,
    signal: AbortSignal,
  ): Promise<Blob /* GLB */>;
}
