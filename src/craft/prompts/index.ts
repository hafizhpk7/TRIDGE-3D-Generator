import cat from '../fixtures/cat.json';
import { repairAndParse } from '../spec/repair';
import { BODY_TYPES, LIMITS, type BodyType, type ShapeSpec } from '../spec/types';
import { validateSpec } from '../spec/validate';
import createTemplate from './create.md?raw';
import fixTemplate from './fix.md?raw';
import refineTemplate from './refine.md?raw';

/** Bone names per body type (section 6). Shown in the prompt so answers match the animation library. */
export const BONE_TABLE: Record<BodyType, { required: string; optional: string }> = {
  quadruped: {
    required: 'root, hips, spine, chest, head, leg_front_l/r, leg_back_l/r',
    optional: 'neck, tail_1..n, ear_l/r, jaw, leg_*_lower',
  },
  biped: {
    required: 'root, hips, spine, chest, head, arm_l/r, leg_l/r',
    optional: 'neck, forearm_l/r, hand_l/r, shin_l/r, foot_l/r, tail_1..n, ear_l/r',
  },
  bird: { required: 'root, body, head, wing_l/r, leg_l/r', optional: 'neck, tail_1..n' },
  fish: { required: 'root, body, head, tail_1..n', optional: 'fin_l/r, fin_top' },
  snake: { required: 'root, segment_1..n (via tube chain), head', optional: 'jaw' },
  object: { required: 'root', optional: 'any names (only whole-model animations apply)' },
};

/** The schema in plain words, generated from the same constants the validator uses. */
export function schemaSummary(): string {
  const L = LIMITS;
  return [
    '{',
    '  "version": 1,',
    '  "name": "string",',
    `  "bodyType": "${BODY_TYPES.join(' | ')}",`,
    `  "palette": { "key": "#RRGGBB" },   // at most ${L.paletteMax} colors`,
    `  "bones": [ { "name": "head", "parent": "neck" /* null for the root */, "head": [x, y, z], "mirror": "x" } ],   // at most ${L.bonesMax}`,
    `  "parts": [ ... ]   // at most ${L.partsMax}`,
    '}',
    '',
    'Every part has: "id" (unique), "shape", "position": [x, y, z], "rotation": [x, y, z] (optional, degrees),',
    '"color" (a palette key or a hex string), "bone" (the bone it moves with), "mirror": "x" (optional),',
    `"sides": ${L.sidesMin}-${L.sidesMax} (optional, radial segments).`,
    'Shapes and their size fields:',
    '  sphere:   "radii": [x, y, z]   (an ellipsoid)',
    `  box:      "size": [x, y, z], "bevel": 0-${L.bevelMax} (optional)`,
    '  cylinder: "radiusTop", "radiusBottom", "height"',
    '  cone:     "radius", "height"',
    '  capsule:  "radius", "length"',
    '  torus:    "radius", "tube", "arc" (optional, degrees)',
    `  tube:     "points": [[x, y, z], ...] (${L.tubePointsMin}-${L.tubePointsMax} points, model space), "radiusStart", "radiusEnd",`,
    `            "boneChain": "tail" (optional, makes tail_1..tail_n), "chainLength": ${L.chainMin}-${L.chainMax} (optional)`,
    `All coordinates between -${L.coord} and ${L.coord}. Sizes between ${L.sizeMin} and ${L.sizeMax}.`,
  ].join('\n');
}

function boneTable(bodyType: BodyType | 'auto'): string {
  if (bodyType !== 'auto') {
    const t = BONE_TABLE[bodyType];
    return `${bodyType}: required ${t.required}; optional ${t.optional}`;
  }
  return BODY_TYPES.map(
    (b) => `- ${b}: required ${BONE_TABLE[b].required}; optional ${BONE_TABLE[b].optional}`,
  ).join('\n');
}

/** Replace {{key}} placeholders and {{#if key}}...{{/if}} blocks. */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
  flags: Record<string, boolean> = {},
): string {
  const withBlocks = template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key: string, body: string) => (flags[key] ? body : ''),
  );
  // A function replacement keeps "$" characters in the values from being treated as patterns.
  return withBlocks.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export interface CreateInput {
  description: string;
  /** The user will attach a photo in Claude themselves. */
  hasPhoto: boolean;
  bodyType: BodyType | 'auto';
}

export function createPrompt({ description, hasPhoto, bodyType }: CreateInput): string {
  const text = description.trim() || 'A cute toy animal.';
  return fillTemplate(
    createTemplate,
    {
      description: text,
      bodyType:
        bodyType === 'auto'
          ? 'choose the best fit: quadruped, biped, bird, fish, snake, object'
          : bodyType,
      schemaSummary: schemaSummary(),
      boneTable: boneTable(bodyType),
      exampleCatJson: JSON.stringify(cat),
    },
    { photo: hasPhoto },
  );
}

export function fixPrompt(errors: string[], previousRawText: string): string {
  return fillTemplate(fixTemplate, {
    errorList: errors.map((e) => `- ${e}`).join('\n'),
    previousRawText,
  });
}

/** The request may be in Indonesian or English; it is passed through unchanged. */
export function refinePrompt(request: string, spec: ShapeSpec): string {
  return fillTemplate(refineTemplate, {
    request: request.trim(),
    currentSpecJson: JSON.stringify(spec),
  });
}

export type AnswerResult =
  | { ok: true; spec: ShapeSpec; warnings: string[]; notes: string[] }
  | { ok: false; errors: string[] };

/** Everything between "pasted text" and "a validated spec". Never executes the text. */
export function processAnswer(raw: string): AnswerResult {
  const parsed = repairAndParse(raw);
  if (!parsed.ok) {
    const where =
      parsed.line !== undefined ? ` (line ${parsed.line}, column ${parsed.column ?? '?'})` : '';
    return { ok: false, errors: [`${parsed.message}${where}`] };
  }
  const result = validateSpec(parsed.value);
  if (!result.ok || !result.spec) return { ok: false, errors: result.errors };
  return { ok: true, spec: result.spec, warnings: result.warnings, notes: parsed.notes };
}
