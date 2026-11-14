import { describe, expect, it, vi } from 'vitest';
import { classifyError, isGlb, ProviderError, summarizeFailures } from './errors';
import { generateWithFallback, orderProviders } from './fallback';
import { stageToStatus } from './spaceStatus';
import type { ImageTo3DProvider } from './types';

function fake(id: string, behavior: () => Promise<Blob>): ImageTo3DProvider {
  return {
    id,
    name: id,
    license: 'test',
    typicalWait: 'soon',
    healthCheck: async () => 'online',
    generate: vi.fn(async () => behavior()),
  };
}
const glb = () => new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46])]);
const opts = { backgroundRemoved: true };

describe('classifyError', () => {
  it('recognizes GPU quota messages', () => {
    const e = classifyError(
      new Error('You have exceeded your GPU quota (75s requested vs. 60s left)'),
    );
    expect(e.kind).toBe('quota');
    expect(e.message).toMatch(/Free GPU quota reached/);
  });
  it('recognizes sleeping or missing spaces', () => {
    expect(classifyError(new Error('Space metadata could not be loaded')).kind).toBe('offline');
    expect(classifyError(new TypeError('Failed to fetch')).kind).toBe('offline');
  });
  it('recognizes timeouts and aborts', () => {
    expect(classifyError(new Error('Request timed out')).kind).toBe('timeout');
    expect(classifyError(new DOMException('x', 'AbortError')).kind).toBe('cancelled');
  });
  it('falls back to a generic failure', () => {
    expect(classifyError({ message: 'weird' }).kind).toBe('failed');
  });
  it('never offers retry after a cancel', () => {
    expect(new ProviderError('cancelled').retryable).toBe(false);
    expect(new ProviderError('quota').retryable).toBe(true);
  });
});

describe('summarizeFailures', () => {
  it('prefers the most actionable reason', () => {
    const s = summarizeFailures([new ProviderError('failed'), new ProviderError('quota')]);
    expect(s.kind).toBe('quota');
  });
});

describe('isGlb', () => {
  it('checks the glTF magic number', () => {
    const ok = new Uint8Array(12);
    ok.set([0x67, 0x6c, 0x54, 0x46]);
    expect(isGlb(ok.buffer)).toBe(true);
    expect(isGlb(new Uint8Array(12).buffer)).toBe(false);
    expect(isGlb(new ArrayBuffer(3))).toBe(false);
  });
});

describe('stageToStatus', () => {
  it('maps Space stages to chips', () => {
    expect(stageToStatus('RUNNING')).toBe('online');
    expect(stageToStatus('SLEEPING')).toBe('busy');
    expect(stageToStatus('BUILDING')).toBe('busy');
    expect(stageToStatus('CONFIG_ERROR')).toBe('offline');
    expect(stageToStatus('PAUSED')).toBe('offline');
    expect(stageToStatus(undefined)).toBe('unknown');
  });
});

describe('orderProviders', () => {
  const a = fake('a', async () => glb());
  const b = fake('b', async () => glb());
  const c = fake('c', async () => glb());

  it('puts offline providers last and keeps order otherwise', () => {
    const ordered = orderProviders([a, b, c], { a: 'offline', b: 'online', c: 'busy' });
    expect(ordered.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
  it('honors an explicit preference', () => {
    expect(orderProviders([a, b], { a: 'online', b: 'online' }, 'b').map((p) => p.id)).toEqual([
      'b',
      'a',
    ]);
  });
});

describe('generateWithFallback', () => {
  const image = new Blob(['x']);

  it('returns the first provider that succeeds', async () => {
    const a = fake('a', async () => glb());
    const b = fake('b', async () => glb());
    const r = await generateWithFallback({
      providers: [a, b],
      image,
      opts,
      signal: new AbortController().signal,
    });
    expect(r.provider.id).toBe('a');
    expect(b.generate).not.toHaveBeenCalled();
  });

  it('falls back after a failure and reports it', async () => {
    const a = fake('a', async () => {
      throw new Error('exceeded your GPU quota');
    });
    const b = fake('b', async () => glb());
    const onFallback = vi.fn();
    const r = await generateWithFallback({
      providers: [a, b],
      image,
      opts,
      signal: new AbortController().signal,
      callbacks: { onFallback },
    });
    expect(r.provider.id).toBe('b');
    expect(onFallback).toHaveBeenCalledOnce();
    expect(onFallback.mock.calls[0][1].kind).toBe('quota');
  });

  it('throws a summary when everything fails', async () => {
    const boom = (m: string) =>
      fake(m, async () => {
        throw new Error(m);
      });
    await expect(
      generateWithFallback({
        providers: [boom('exceeded your GPU quota'), boom('Failed to fetch')],
        image,
        opts,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ kind: 'quota' });
  });

  it('stops without trying the next provider when cancelled', async () => {
    const controller = new AbortController();
    const a = fake('a', async () => {
      controller.abort();
      throw new DOMException('x', 'AbortError');
    });
    const b = fake('b', async () => glb());
    await expect(
      generateWithFallback({ providers: [a, b], image, opts, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(b.generate).not.toHaveBeenCalled();
  });
});
