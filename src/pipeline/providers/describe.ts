import type { Progress } from './types';

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/** One friendly line describing what a provider is doing right now. */
export function describeProgress(providerName: string, p: Progress | null): string {
  if (!p || p.phase === 'connecting') return `Connecting to ${providerName}…`;
  if (p.phase === 'queued') {
    if (p.queuePosition !== undefined && p.queuePosition > 0) {
      const ahead = p.queuePosition === 1 ? '1 person ahead' : `${p.queuePosition} people ahead`;
      return `Waiting in line at ${providerName}: ${ahead}.`;
    }
    return `Waiting for a free GPU at ${providerName}…`;
  }
  if (p.phase === 'generating') return `${providerName} is building your model…`;
  return 'Downloading your model…';
}
