import JSON5 from 'json5';

export type ParseResult =
  | { ok: true; value: unknown; notes: string[] }
  | { ok: false; message: string; line?: number; column?: number };

/** Remove a Markdown code fence around the text, if there is one. */
export function stripFences(text: string): string {
  const t = text.trim();
  const fenced = /```[a-zA-Z0-9]*\s*\n?([\s\S]*?)```/.exec(t);
  if (fenced) return fenced[1].trim();
  // An opening fence with no closing one (a cut-off answer).
  return t.replace(/^```[a-zA-Z0-9]*\s*\n?/, '').trim();
}

/**
 * Find the first balanced { ... } block, ignoring braces inside strings and comments.
 * Returns null when there is no opening brace, or `{ truncated: true }` when it never closes.
 */
export function extractObject(text: string): { json: string } | { truncated: true } | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return { json: text.slice(start, i + 1) };
    }
  }
  return { truncated: true };
}

/** Clean up what an AI pasted and parse it as data. Nothing is ever executed. */
export function repairAndParse(raw: string): ParseResult {
  const notes: string[] = [];
  let text = raw.trim();
  if (!text) return { ok: false, message: 'Nothing was pasted yet.' };

  const unfenced = stripFences(text);
  if (unfenced !== text) notes.push('Removed the Markdown code fence.');
  text = unfenced;

  const found = extractObject(text);
  if (!found) {
    return {
      ok: false,
      message: 'No JSON object was found in the pasted text. It should start with {.',
    };
  }
  if ('truncated' in found) {
    return {
      ok: false,
      message:
        'The answer looks cut off: the JSON never closes. Ask Claude to answer again with fewer parts.',
    };
  }
  if (found.json.length !== text.length) notes.push('Ignored text around the JSON.');

  try {
    return { ok: true, value: JSON5.parse(found.json), notes };
  } catch (e) {
    const err = e as { message?: string; lineNumber?: number; columnNumber?: number };
    return {
      ok: false,
      message: `The JSON could not be read: ${err.message ?? 'unknown problem'}`,
      line: err.lineNumber,
      column: err.columnNumber,
    };
  }
}
