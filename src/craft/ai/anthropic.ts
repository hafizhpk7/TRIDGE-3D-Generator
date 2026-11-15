import { createPrompt, fixPrompt, refinePrompt } from '../prompts';
import type { CraftAIProvider } from './provider';

/**
 * Anthropic Messages API, called straight from the browser with the user's own key.
 * Checked against the current API docs (2026-11): POST https://api.anthropic.com/v1/messages with
 * x-api-key, anthropic-version, content-type and anthropic-dangerous-direct-browser-access headers,
 * and a body of { model, max_tokens, messages }.
 */
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
/** Editable in the settings. Model names change over time, so this is only a starting point. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 8000;

export class AIError extends Error {}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  /** For tests. */
  fetchImpl?: typeof fetch;
}

/** Friendly message for an API failure. The key is never part of any message. */
export function describeApiError(status: number, apiMessage?: string): string {
  if (status === 401 || status === 403)
    return 'Anthropic did not accept that API key. Check it and try again.';
  if (status === 404 || (status === 400 && /model/i.test(apiMessage ?? ''))) {
    return 'Anthropic does not know that model name. Check the model field in the settings.';
  }
  if (status === 429)
    return 'Anthropic says too many requests were sent. Wait a moment and try again.';
  if (status === 402 || /credit|billing|balance/i.test(apiMessage ?? '')) {
    return 'Your Anthropic account has no credit left for this request.';
  }
  if (status >= 500) return 'Anthropic is having trouble right now. Try again in a minute.';
  return 'Anthropic could not answer that request.';
}

export function anthropicProvider(config: AnthropicConfig): CraftAIProvider {
  const doFetch = config.fetchImpl ?? fetch;

  async function ask(prompt: string, signal?: AbortSignal): Promise<string> {
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new AIError("Couldn't reach Anthropic. Check your connection and try again.");
    }
    if (!res.ok) {
      let apiMessage: string | undefined;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        apiMessage = body.error?.message;
      } catch {
        /* the body was not JSON; the status alone is enough */
      }
      throw new AIError(describeApiError(res.status, apiMessage));
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');
    if (!text) throw new AIError('Anthropic sent back an empty answer. Try again.');
    return text;
  }

  return {
    id: 'anthropic',
    name: 'Anthropic (your API key)',
    createSpec: (input, signal) => ask(createPrompt(input), signal),
    fixSpec: (errors, previous, signal) => ask(fixPrompt(errors, previous), signal),
    refineSpec: (request, spec, signal) => ask(refinePrompt(request, spec), signal),
  };
}
