import { describe, expect, it, vi } from 'vitest';
import penguin from '../fixtures/penguin.json';
import { anthropicProvider, describeApiError } from './anthropic';
import { createWithAI, refineWithAI, type CraftAIProvider } from './provider';

const reply = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

describe('anthropicProvider', () => {
  it('sends the documented request and joins the text blocks', async () => {
    const fetchImpl = vi.fn(() =>
      reply({
        content: [
          { type: 'text', text: '{"a":' },
          { type: 'text', text: '1}' },
        ],
      }),
    );
    const p = anthropicProvider({
      apiKey: 'sk-test-123',
      model: 'm1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await p.createSpec({ description: 'a cat', hasPhoto: false, bodyType: 'auto' });
    expect(text).toBe('{"a":1}');

    const [url, init] = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init!.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-123');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('m1');
    expect(body.max_tokens).toBeGreaterThan(1000);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('a cat');
  });

  it('turns failures into friendly errors that never contain the key', async () => {
    for (const status of [401, 404, 429, 500]) {
      const p = anthropicProvider({
        apiKey: 'sk-secret-key',
        model: 'x',
        fetchImpl: (() =>
          reply(
            { error: { message: `bad key sk-secret-key` } },
            status,
          )) as unknown as typeof fetch,
      });
      await expect(
        p.createSpec({ description: 'x', hasPhoto: false, bodyType: 'auto' }),
      ).rejects.toThrow(
        expect.objectContaining({ message: expect.not.stringContaining('sk-secret-key') }),
      );
    }
    expect(describeApiError(401)).toMatch(/API key/);
    expect(describeApiError(404)).toMatch(/model/);
    expect(describeApiError(400, 'invalid model: nope')).toMatch(/model/);
    expect(describeApiError(402)).toMatch(/credit/);
  });

  it('reports network failures plainly', async () => {
    const p = anthropicProvider({
      apiKey: 'k',
      model: 'x',
      fetchImpl: (() =>
        Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch,
    });
    await expect(
      p.createSpec({ description: 'x', hasPhoto: false, bodyType: 'auto' }),
    ).rejects.toThrow(/reach Anthropic/);
  });

  it('rejects an empty answer', async () => {
    const p = anthropicProvider({
      apiKey: 'k',
      model: 'x',
      fetchImpl: (() => reply({ content: [] })) as unknown as typeof fetch,
    });
    await expect(
      p.createSpec({ description: 'x', hasPhoto: false, bodyType: 'auto' }),
    ).rejects.toThrow(/empty/);
  });
});

function fakeProvider(answers: string[]): CraftAIProvider & { calls: string[] } {
  const calls: string[] = [];
  const next = (label: string) => {
    calls.push(label);
    return Promise.resolve(answers.shift() ?? '');
  };
  return {
    id: 'fake',
    name: 'Fake',
    calls,
    createSpec: () => next('create'),
    fixSpec: () => next('fix'),
    refineSpec: () => next('refine'),
  };
}

describe('auto-fix flow', () => {
  const good = JSON.stringify(penguin);

  it('accepts a good first answer without a fix round', async () => {
    const p = fakeProvider([good]);
    const out = await createWithAI(p, {
      description: 'penguin',
      hasPhoto: false,
      bodyType: 'bird',
    });
    expect(out.result.ok).toBe(true);
    expect(out.fixed).toBe(false);
    expect(p.calls).toEqual(['create']);
  });

  it('sends the fix prompt once when the first answer is invalid', async () => {
    const p = fakeProvider(['{ not json', good]);
    const out = await createWithAI(p, {
      description: 'penguin',
      hasPhoto: false,
      bodyType: 'bird',
    });
    expect(out.result.ok).toBe(true);
    expect(out.fixed).toBe(true);
    expect(p.calls).toEqual(['create', 'fix']);
  });

  it('gives up after one fix and shows the errors', async () => {
    const p = fakeProvider(['nope', 'still nope']);
    const out = await createWithAI(p, { description: 'x', hasPhoto: false, bodyType: 'auto' });
    expect(out.result.ok).toBe(false);
    expect(p.calls).toEqual(['create', 'fix']);
    expect(out.raw).toBe('still nope');
  });

  it('works for refine too', async () => {
    const p = fakeProvider([good]);
    const spec = (
      await createWithAI(fakeProvider([good]), {
        description: 'x',
        hasPhoto: false,
        bodyType: 'auto',
      })
    ).result;
    if (!spec.ok) throw new Error('setup failed');
    const out = await refineWithAI(p, 'bigger head', spec.spec);
    expect(out.result.ok).toBe(true);
    expect(p.calls).toEqual(['refine']);
  });
});
