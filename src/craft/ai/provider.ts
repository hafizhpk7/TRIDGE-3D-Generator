import {
  createPrompt,
  fixPrompt,
  processAnswer,
  refinePrompt,
  type AnswerResult,
  type CreateInput,
} from '../prompts';
import type { ShapeSpec } from '../spec/types';

/**
 * A model that can write Shape Specs for us. Methods return the raw text of the answer, which then goes
 * through the same repair and validation path as pasted text. Nothing returned is ever executed.
 */
export interface CraftAIProvider {
  id: string;
  name: string;
  createSpec(input: CreateInput, signal?: AbortSignal): Promise<string>;
  fixSpec(errors: string[], previousRawText: string, signal?: AbortSignal): Promise<string>;
  refineSpec(request: string, spec: ShapeSpec, signal?: AbortSignal): Promise<string>;
}

export interface AIOutcome {
  result: AnswerResult;
  /** The raw answer that produced `result`, kept so the user can see or copy it. */
  raw: string;
  /** True when the first answer was invalid and one automatic fix round was needed. */
  fixed: boolean;
}

/** Validate an answer; if it is invalid, ask for one correction, then give up and show the errors. */
async function validateWithOneFix(
  provider: CraftAIProvider,
  raw: string,
  signal?: AbortSignal,
): Promise<AIOutcome> {
  const first = processAnswer(raw);
  if (first.ok) return { result: first, raw, fixed: false };
  const retry = await provider.fixSpec(first.errors, raw, signal);
  return { result: processAnswer(retry), raw: retry, fixed: true };
}

export async function createWithAI(
  provider: CraftAIProvider,
  input: CreateInput,
  signal?: AbortSignal,
) {
  return validateWithOneFix(provider, await provider.createSpec(input, signal), signal);
}

export async function refineWithAI(
  provider: CraftAIProvider,
  request: string,
  spec: ShapeSpec,
  signal?: AbortSignal,
) {
  return validateWithOneFix(provider, await provider.refineSpec(request, spec, signal), signal);
}

export { createPrompt, fixPrompt, refinePrompt };
