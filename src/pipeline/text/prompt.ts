/** Style hints that make a picture easy to turn into a 3D model. */
export const STYLE_HINTS = [
  'single object',
  'centered',
  'plain white background',
  'low poly toy',
  'soft studio lighting',
];

export const MAX_PROMPT_LENGTH = 200;

export const PROMPT_EXAMPLES = [
  'a cute orange cat',
  'a chubby penguin with a red scarf',
  'kucing oranye yang lucu',
  'a small red robot',
];

/** Trim, collapse whitespace, drop control characters, and cap the length. */
export function cleanPrompt(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_PROMPT_LENGTH)
      .trim()
  );
}

/**
 * The text actually sent to the picture maker.
 * Style hints are added unless the user already said something similar.
 */
export function buildPrompt(
  raw: string,
  opts: { styleHints: boolean } = { styleHints: true },
): string {
  const text = cleanPrompt(raw);
  if (!text || !opts.styleHints) return text;
  const lower = text.toLowerCase();
  const missing = STYLE_HINTS.filter((hint) => {
    const key = hint.replace('plain white ', '').replace('low poly ', '');
    return !lower.includes(hint) && !lower.includes(key);
  });
  return [text, ...missing].join(', ');
}
