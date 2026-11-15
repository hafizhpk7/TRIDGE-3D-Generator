import dictionary from './dictionary.json';
import type { AnimEntry, AnimId, AnimParams } from './types';

/** One thing the user asked for, before checking what the model can actually do. */
export interface ParsedStep {
  id: AnimId;
  params: AnimParams;
  /** How many times to repeat it (jumps) or to fit into the duration (loops). */
  repeat: number;
  /** The words that produced it, for showing back to the user. */
  text: string;
}

export type ParseResult =
  | { ok: true; steps: ParsedStep[]; ignored: string[] }
  | { ok: false; reason: 'empty' | 'unknown'; unknown: string[] };

type Kind = 'anim' | 'speed' | 'intensity' | 'amp';
interface Entry {
  phrase: string[];
  kind: Kind;
  id?: AnimId;
  value?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Lowercase, drop accents, and turn punctuation into spaces. Hyphens count as spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/[^a-z0-9'.\s,;&+>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (phrase: string) => normalize(phrase).split(' ').filter(Boolean);

function buildTable(): { entries: Entry[]; connectors: string[][]; ignore: Set<string> } {
  const entries: Entry[] = [];
  for (const [id, phrases] of Object.entries(dictionary.animations)) {
    for (const p of phrases) entries.push({ phrase: words(p), kind: 'anim', id: id as AnimId });
  }
  for (const [p, v] of Object.entries(dictionary.speed))
    entries.push({ phrase: words(p), kind: 'speed', value: v });
  for (const [p, v] of Object.entries(dictionary.intensity))
    entries.push({ phrase: words(p), kind: 'intensity', value: v });
  for (const p of dictionary.amplifiers) entries.push({ phrase: words(p), kind: 'amp' });
  // Longest phrases first, so "squash and stretch" wins over "stretch".
  entries.sort((a, b) => b.phrase.length - a.phrase.length);
  const connectors = dictionary.connectors.map(words).sort((a, b) => b.length - a.length);
  return { entries, connectors, ignore: new Set(dictionary.ignore.flatMap((w) => words(w))) };
}

const TABLE = buildTable();

const GLUE = '\u00a7';

/**
 * Words that are both a connector and part of a move name ("squash and stretch") must stay together,
 * so those phrases are glued before the request is split.
 */
function glueProtectedPhrases(text: string): string {
  const connectorWords = new Set(TABLE.connectors.filter((c) => c.length === 1).map((c) => c[0]));
  let out = text;
  for (const e of TABLE.entries) {
    if (e.phrase.length > 1 && e.phrase.some((w) => connectorWords.has(w))) {
      out = out.replace(new RegExp(`\\b${e.phrase.join(' ')}\\b`, 'g'), e.phrase.join(GLUE));
    }
  }
  return out;
}

/** Split a request into parts at "then", "terus", commas and so on. */
export function splitSegments(text: string): string[] {
  const t = glueProtectedPhrases(normalize(text))
    .replace(/[,;>+&]+/g, ' | ')
    .replace(/\s+/g, ' ');
  const tokens = t.split(' ');
  const out: string[][] = [[]];
  for (let i = 0; i < tokens.length;) {
    if (tokens[i] === '|') {
      out.push([]);
      i++;
      continue;
    }
    const conn = TABLE.connectors.find((c) => c.every((w, k) => tokens[i + k] === w));
    if (conn) {
      out.push([]);
      i += conn.length;
      continue;
    }
    out[out.length - 1].push(tokens[i]);
    i++;
  }
  return out.map((seg) => seg.join(' ').split(GLUE).join(' ').trim()).filter(Boolean);
}

/** Pull "2x", "twice", "3 times" and "for 5 seconds" out of a segment. */
function extractNumbers(segment: string): { text: string; repeat?: number; duration?: number } {
  let text = segment;
  let repeat: number | undefined;
  let duration: number | undefined;

  const dur = /(?:\b(?:for|selama)\s+)?(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|detik|s)\b/.exec(text);
  if (dur) {
    duration = clamp(Number(dur[1]), 0.5, 60);
    text = text.replace(dur[0], ' ');
  }
  const times = /(\d+)\s*(?:x|kali|times|time)\b/.exec(text);
  if (times) {
    repeat = clamp(Number(times[1]), 1, 8);
    text = text.replace(times[0], ' ');
  }
  for (const [word, n] of Object.entries(dictionary.repeat)) {
    const re = new RegExp(`\\b${normalize(word)}\\b`);
    if (re.test(text)) {
      repeat = repeat ?? n;
      text = text.replace(re, ' ');
    }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), repeat, duration };
}

interface Match {
  entry: Entry;
  start: number;
  end: number;
}

function scan(tokens: string[]): { matches: Match[]; leftover: string[] } {
  const matches: Match[] = [];
  const leftover: string[] = [];
  for (let i = 0; i < tokens.length;) {
    const entry = TABLE.entries.find((e) => e.phrase.every((w, k) => tokens[i + k] === w));
    if (entry) {
      matches.push({ entry, start: i, end: i + entry.phrase.length });
      i += entry.phrase.length;
    } else {
      leftover.push(tokens[i]);
      i++;
    }
  }
  return { matches, leftover };
}

/** An amplifier next to a modifier pushes it further from "normal". */
function amplify(value: number, amplified: boolean): number {
  return amplified ? 1 + (value - 1) * 1.6 : value;
}

/** Understand a request like "walk slowly then jump high" or "kucing jalan pelan terus loncat tinggi". */
export function parsePrompt(text: string): ParseResult {
  const segments = splitSegments(text);
  if (segments.length === 0) return { ok: false, reason: 'empty', unknown: [] };

  const steps: ParsedStep[] = [];
  const unknownAll: string[] = [];
  const ignoredNotes: string[] = [];

  for (const raw of segments) {
    const { text: cleaned, repeat, duration } = extractNumbers(raw);
    const tokens = cleaned.split(' ').filter(Boolean);
    const { matches, leftover } = scan(tokens);

    let speed = 1;
    let intensity = 1;
    matches.forEach((m, mi) => {
      if (m.entry.kind !== 'speed' && m.entry.kind !== 'intensity') return;
      // "very fast", "cepat banget": an amplifier right next to the modifier makes it stronger.
      const before = matches[mi - 1];
      const after = matches[mi + 1];
      const amplified =
        (before?.entry.kind === 'amp' && before.end === m.start) ||
        (after?.entry.kind === 'amp' && after.start === m.end);
      const v = amplify(m.entry.value ?? 1, Boolean(amplified));
      if (m.entry.kind === 'speed') speed = v;
      else intensity = v;
    });

    const anims = matches.filter((m) => m.entry.kind === 'anim');
    for (const m of anims) {
      steps.push({
        id: m.entry.id as AnimId,
        params: {
          speed: clamp(speed, 0.25, 3),
          intensity: clamp(intensity, 0, 2),
          ...(duration ? { duration } : {}),
        },
        repeat: repeat ?? 1,
        text: tokens.slice(m.start, m.end).join(' '),
      });
    }

    const unknown = leftover.filter((w) => !TABLE.ignore.has(w) && !/^\d+(\.\d+)?$/.test(w));
    if (anims.length === 0) unknownAll.push(...unknown);
    else ignoredNotes.push(...unknown);
  }

  if (steps.length === 0)
    return { ok: false, reason: 'unknown', unknown: [...new Set(unknownAll)] };
  return { ok: true, steps, ignored: [...new Set([...ignoredNotes, ...unknownAll])] };
}

// ---- matching the request to what a model can do ----------------------------------------------------------

/** Animations that stand in for another one when the model cannot do it, tried in order. */
const FALLBACKS: Partial<Record<AnimId, AnimId[]>> = {
  jump: ['hop', 'bounce'],
  hop: ['bounce'],
  walk: ['wobble'],
  trot: ['walk', 'wobble'],
  run: ['trot', 'walk', 'shake'],
  dance: ['wobble', 'spin'],
  wave: ['wobble'],
  clap: ['shake'],
  fly: ['float'],
  flap: ['shake'],
  swim: ['float'],
  slither: ['wobble'],
  sit: ['squash'],
  lie_down: ['squash'],
  stretch: ['squash'],
  look_around: ['wobble'],
  tail_wag: ['shake'],
  idle: ['float'],
};

export interface Resolved {
  steps: ParsedStep[];
  /** Requests that were swapped for something close, such as a jump for a model with no legs. */
  swapped: { asked: AnimId; got: AnimId }[];
  /** Requests nothing could stand in for. */
  missing: AnimId[];
}

export function resolveSteps(parsed: ParsedStep[], available: AnimEntry[]): Resolved {
  const have = new Set(available.map((a) => a.id));
  const steps: ParsedStep[] = [];
  const swapped: Resolved['swapped'] = [];
  const missing: AnimId[] = [];
  for (const step of parsed) {
    if (have.has(step.id)) {
      steps.push(step);
      continue;
    }
    const stand = (FALLBACKS[step.id] ?? []).find((id) => have.has(id));
    if (stand) {
      steps.push({ ...step, id: stand });
      swapped.push({ asked: step.id, got: stand });
    } else {
      missing.push(step.id);
    }
  }
  return { steps, swapped, missing };
}

const LABELS: Record<string, string> = Object.fromEntries(
  Object.keys(dictionary.animations).map((id) => [id, id.replace('_', ' ')]),
);
export const labelOf = (id: AnimId) => LABELS[id] ?? id;

/** A friendly line for when the request could not be used, plus what to try instead. */
export function friendlyReply(
  result: ParseResult,
  available: AnimEntry[],
  resolved?: Resolved,
): { message: string; suggestions: AnimId[] } {
  const suggestions = available.slice(0, 6).map((a) => a.id);
  if (!result.ok) {
    if (result.reason === 'empty')
      return { message: 'Type what you want it to do, like "walk then jump".', suggestions };
    const heard = result.unknown.slice(0, 3).join(', ');
    return {
      message: heard
        ? `I don't know "${heard}" yet. Try one of these:`
        : "I couldn't find a move in that. Try one of these:",
      suggestions,
    };
  }
  if (resolved && resolved.steps.length === 0) {
    const asked = resolved.missing.map(labelOf).join(', ');
    return { message: `This model can't do ${asked}. It can do these:`, suggestions };
  }
  return { message: '', suggestions: [] };
}
