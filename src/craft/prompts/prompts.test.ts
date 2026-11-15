import { describe, expect, it } from 'vitest';
import penguin from '../fixtures/penguin.json';
import fenced from '../fixtures/broken/fenced-with-intro.txt?raw';
import truncated from '../fixtures/broken/truncated.txt?raw';
import { validateSpec } from '../spec/validate';
import {
  createPrompt,
  fillTemplate,
  fixPrompt,
  processAnswer,
  refinePrompt,
  schemaSummary,
} from './index';

describe('fillTemplate', () => {
  it('replaces values and conditional blocks', () => {
    expect(fillTemplate('a {{x}} b', { x: '1' })).toBe('a 1 b');
    expect(fillTemplate('[{{#if p}}yes{{/if}}]', {}, { p: true })).toBe('[yes]');
    expect(fillTemplate('[{{#if p}}yes{{/if}}]', {}, { p: false })).toBe('[]');
  });
  it('keeps dollar signs in values literally', () => {
    expect(fillTemplate('{{x}}', { x: 'cost $& $1' })).toBe('cost $& $1');
  });
  it('leaves unknown placeholders visible', () => {
    expect(fillTemplate('{{nope}}', {})).toBe('{{nope}}');
  });
});

describe('createPrompt', () => {
  const prompt = createPrompt({
    description: 'a chubby penguin with a red scarf',
    hasPhoto: false,
    bodyType: 'auto',
  });

  it('fills every placeholder', () => {
    expect(prompt).not.toMatch(/\{\{|\}\}/);
    expect(prompt).toContain('a chubby penguin with a red scarf');
  });

  it('includes the schema summary, bone names and the cat example', () => {
    expect(prompt).toContain(schemaSummary());
    expect(prompt).toContain('leg_front_l/r');
    expect(prompt).toContain('"name":"Orange cat"');
    expect(prompt).toContain('choose the best fit');
  });

  it('adds the photo paragraph only when asked', () => {
    expect(prompt).not.toContain('I attached a photo');
    const withPhoto = createPrompt({ description: 'x', hasPhoto: true, bodyType: 'bird' });
    expect(withPhoto).toContain('I attached a photo');
    expect(withPhoto).toContain('Body type: bird');
    expect(withPhoto).toContain('bird: required root, body, head');
  });

  it('describes limits that really match the validator', () => {
    expect(schemaSummary()).toContain('at most 150');
    expect(schemaSummary()).toContain('at most 64');
    expect(schemaSummary()).toContain('at most 16 colors');
  });

  it('survives an empty description', () => {
    expect(createPrompt({ description: '  ', hasPhoto: false, bodyType: 'auto' })).toContain(
      'cute toy animal',
    );
  });
});

describe('fix and refine prompts', () => {
  it('lists the problems and repeats the previous text', () => {
    const p = fixPrompt(['parts[1].bone: missing', 'No root bone'], '{"oops": true}');
    expect(p).toContain('- parts[1].bone: missing');
    expect(p).toContain('- No root bone');
    expect(p).toContain('{"oops": true}');
    expect(p).not.toMatch(/\{\{/);
  });

  it('passes the request through unchanged, including Indonesian', () => {
    const spec = validateSpec(JSON.parse(JSON.stringify(penguin))).spec!;
    const p = refinePrompt('kasih topi di kepala', spec);
    expect(p).toContain('Change: kasih topi di kepala');
    expect(p).toContain('"name":"Chubby penguin with red scarf"');
    expect(p).not.toMatch(/\{\{/);
  });
});

describe('processAnswer', () => {
  it('builds a model from a clean answer', () => {
    const r = processAnswer(JSON.stringify(penguin));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.parts.length).toBeGreaterThan(10);
  });

  it('builds from messy output: fenced, with intro text and comments', () => {
    const r = processAnswer(fenced);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notes.length).toBeGreaterThan(0);
  });

  it('turns problems into readable errors that feed the fix prompt', () => {
    const r = processAnswer('{ "version": 1, "parts": [ { "id": "a" "shape": "sphere" } ] }');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toMatch(/line \d+/);
      expect(fixPrompt(r.errors, 'broken')).toContain(r.errors[0]);
    }
    const t = processAnswer(truncated);
    expect(t.ok).toBe(false);
    const noBones = processAnswer(
      JSON.stringify({
        parts: [
          { shape: 'sphere', radii: [1, 1, 1], position: [0, 1, 0], color: '#fff', bone: 'x' },
        ],
      }),
    );
    expect(noBones.ok).toBe(false);
    if (!noBones.ok) expect(noBones.errors.join(' ')).toMatch(/bones/);
  });
});
