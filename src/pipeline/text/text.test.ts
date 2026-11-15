import { describe, expect, it } from 'vitest';
import { buildPrompt, cleanPrompt, MAX_PROMPT_LENGTH, STYLE_HINTS } from './prompt';
import { firstFileUrl, sniffImageType } from './image';

describe('cleanPrompt', () => {
  it('trims, collapses spaces and strips control characters', () => {
    expect(cleanPrompt('  a   cute\n\tcat\u0000 ')).toBe('a cute cat');
  });
  it('caps the length', () => {
    expect(cleanPrompt('x'.repeat(500)).length).toBeLessThanOrEqual(MAX_PROMPT_LENGTH);
  });
  it('returns an empty string for blank input', () => {
    expect(cleanPrompt('   \n ')).toBe('');
  });
});

describe('buildPrompt', () => {
  it('appends the style hints', () => {
    const p = buildPrompt('a cute orange cat');
    expect(p.startsWith('a cute orange cat, ')).toBe(true);
    for (const hint of STYLE_HINTS) expect(p).toContain(hint);
  });

  it('does not repeat hints the user already wrote', () => {
    const p = buildPrompt('a red robot on a plain white background, centered');
    expect(p.match(/centered/g)).toHaveLength(1);
    expect(p.match(/white background/g)).toHaveLength(1);
    expect(p).toContain('low poly toy');
  });

  it('keeps non-English text and can skip the hints', () => {
    expect(buildPrompt('kucing oranye yang lucu')).toMatch(/^kucing oranye yang lucu, /);
    expect(buildPrompt('a cat', { styleHints: false })).toBe('a cat');
  });

  it('gives nothing for an empty prompt', () => {
    expect(buildPrompt('  ')).toBe('');
  });
});

describe('sniffImageType', () => {
  const bytes = (head: number[]) => new Uint8Array([...head, ...new Array(12).fill(0)]).buffer;
  it('recognizes png, jpeg and webp', () => {
    expect(sniffImageType(bytes([0x89, 0x50, 0x4e, 0x47]))?.ext).toBe('png');
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageType(webp.buffer)?.mime).toBe('image/webp');
  });
  it('rejects other data', () => {
    expect(sniffImageType(new TextEncoder().encode('<html>not an image</html>').buffer)).toBeNull();
    expect(sniffImageType(new ArrayBuffer(3))).toBeNull();
  });
});

describe('firstFileUrl', () => {
  it('finds urls in direct, wrapped and gallery outputs', () => {
    expect(firstFileUrl([{ path: '/x', url: 'https://a.test/img.webp' }, 1])).toBe(
      'https://a.test/img.webp',
    );
    expect(
      firstFileUrl([[{ image: { url: 'https://b.test/i.png' }, caption: null }], '1', 2]),
    ).toBe('https://b.test/i.png');
    expect(firstFileUrl([{ value: { url: 'https://c.test/x' } }])).toBe('https://c.test/x');
  });
  it('returns null when nothing looks like a file', () => {
    expect(firstFileUrl([null, 'seed 42', 7])).toBeNull();
  });
});
