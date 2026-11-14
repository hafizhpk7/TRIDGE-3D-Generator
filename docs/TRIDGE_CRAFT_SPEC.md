# TRIDGE Craft — Technical Specification

Companion document to `TRIDGE_BUILD_PROMPT.md` (Phase 7). This is the source of truth for Craft mode. If anything here conflicts with the build prompt, follow this document and tell me about the conflict.

---

## 1. What Craft mode is

Craft mode builds 3D models **from primitive shapes described as data**. It mirrors how Claude creates a 3D model in chat: it doesn't sculpt or scan, it writes a description of shapes (spheres, cones, cylinders...) with positions, sizes, rotations, and colors, and code turns that into geometry.

In TRIDGE, Craft becomes the third option on the Generate step:

| Source | How it works | Needs internet/GPU |
|---|---|---|
| From photo | Image → AI image-to-3D Space | Yes |
| From text | Text → image → AI image-to-3D Space | Yes |
| **Craft** | Shape Spec (JSON) → builder | **No** (templates); only a Claude.ai tab for the bridge |

Why it matters:
- **Always available.** Templates work offline, even when every free Space is down.
- **Pre-rigged.** Every part is attached to a named bone, so animations work immediately with no auto-rigging.
- **Editable.** The model stays a list of parts, so users can tweak proportions, colors, and shapes later.
- **Naturally low poly.** Segment counts are a parameter, so the detail slider is exact and instant.

There are three ways to get a Shape Spec:
1. **Templates**: built-in parametric generators (cat, dog, bunny...). Offline, instant.
2. **Ask Claude bridge**: TRIDGE writes a prompt, the user pastes it into Claude.ai (free plan works), and pastes the JSON answer back. Free.
3. **Direct API (optional, off by default)**: the user enters their own API key so TRIDGE can call a model directly. May cost money; clearly labeled.

---

## 2. Core rule: data, never code

AI output is **never executed**. No `eval`, no `new Function`, no dynamic `import`, no injecting returned text into the DOM as HTML. Everything that comes from an AI (or a pasted file) is parsed as JSON, repaired, validated against the schema, clamped to safe ranges, and only then passed to the builder.

---

## 3. Coordinate conventions

- Units: arbitrary "toy units". A typical model is **2–4 units tall**.
- **+Y is up**, ground is **y = 0**. The lowest point of the model should touch y = 0.
- **+Z is the front** (the direction the model faces).
- **+X is the model's left side.** Left parts use the suffix `_l`; mirroring creates the `_r` copy.
- Rotations are **Euler angles in degrees**, order XYZ (easier for language models than radians).
- All part positions are in **model space** (not relative to a parent). This keeps specs easy to write and read.

---

## 4. Shape Spec v1

### 4.1 TypeScript types

```ts
type Vec3 = [number, number, number];
type ColorRef = string; // palette key ("fur") or hex ("#FF9F43")

type BodyType = 'quadruped' | 'biped' | 'bird' | 'fish' | 'snake' | 'object';

interface ShapeSpec {
  version: 1;
  name: string;                 // "Orange cat"
  bodyType: BodyType;
  palette: Record<string, string>; // key → hex, max 16 entries
  bones: Bone[];                // max 64
  parts: Part[];                // max 150 (after mirror expansion: 300)
  notes?: string;               // free text from the author, ignored by the builder
}

interface Bone {
  name: string;                 // must follow the naming convention in section 6
  parent: string | null;        // exactly one bone has parent null (usually "root")
  head: Vec3;                   // joint position in model space
  mirror?: 'x';                 // create the _r twin automatically
}

interface PartBase {
  id: string;                   // unique, e.g. "ear_l"
  position: Vec3;
  rotation?: Vec3;              // degrees, default [0,0,0]
  color: ColorRef;
  bone: string;                 // bone this part moves with
  mirror?: 'x';                 // duplicate across X; id and bone get _l → _r
  sides?: number;               // override radial segments (3–32), e.g. 4 for faceted ears
}

type Part =
  | (PartBase & { shape: 'sphere';   radii: Vec3 })                       // ellipsoid
  | (PartBase & { shape: 'box';      size: Vec3; bevel?: number })        // bevel 0–0.5
  | (PartBase & { shape: 'cylinder'; radiusTop: number; radiusBottom: number; height: number })
  | (PartBase & { shape: 'cone';     radius: number; height: number })
  | (PartBase & { shape: 'capsule';  radius: number; length: number })
  | (PartBase & { shape: 'torus';    radius: number; tube: number; arc?: number }) // arc in degrees
  | (PartBase & {
      shape: 'tube';                // smooth tube through points, for tails, necks, tentacles
      points: Vec3[];               // 2–12 points, model space
      radiusStart: number;
      radiusEnd: number;
      boneChain?: string;           // e.g. "tail": auto-creates tail_1..tail_n along the tube
      chainLength?: number;         // number of chain bones, 2–8, default 4
      // when boneChain is set, `bone` is the parent of the first chain bone
    });
```

Cylinders, cones, and capsules point along **+Y before rotation** (three.js default).

### 4.2 Validation limits

Implement with **zod**. Values outside these ranges are clamped and reported as warnings, not hard errors:

| Field | Range |
|---|---|
| Any coordinate | −10 to 10 |
| Any size, radius, length | 0.005 to 10 |
| `rotation` components | −360 to 360 |
| `sides` | 3 to 32 |
| `bevel` | 0 to 0.5 |
| `tube.points` | 2 to 12 points |
| `palette` | max 16 entries, valid hex |
| `parts` | max 150 before mirroring |
| `bones` | max 64 |

Hard errors (spec rejected, user sees the list): invalid JSON after repair, missing `parts`, zero valid parts, no root bone, bone cycles.

Soft fixes (applied automatically, reported as warnings):
- Unknown palette key → `#B0B0C0` gray.
- Unknown `bone` on a part → nearest bone by distance to the part position.
- Duplicate `id` → suffix `_2`, `_3`.
- Missing `rotation` → `[0,0,0]`.
- Model floating or sunk → shift everything so the lowest point is at y = 0.
- Unknown `shape` → part dropped with a warning.

### 4.3 Example: the cat

```json
{
  "version": 1,
  "name": "Orange cat",
  "bodyType": "quadruped",
  "palette": { "fur": "#FF9F43", "stripe": "#E07A1F", "cream": "#FFF3E0", "pink": "#FF8FB1", "ink": "#22184A" },
  "bones": [
    { "name": "root",        "parent": null,    "head": [0, 0, 0] },
    { "name": "hips",        "parent": "root",  "head": [0, 1.25, -0.6] },
    { "name": "spine",       "parent": "hips",  "head": [0, 1.3, 0] },
    { "name": "chest",       "parent": "spine", "head": [0, 1.3, 0.7] },
    { "name": "neck",        "parent": "chest", "head": [0, 1.6, 1.0] },
    { "name": "head",        "parent": "neck",  "head": [0, 1.9, 1.15] },
    { "name": "leg_front_l", "parent": "chest", "head": [0.42, 1.05, 0.72], "mirror": "x" },
    { "name": "leg_back_l",  "parent": "hips",  "head": [0.46, 1.05, -0.7], "mirror": "x" }
  ],
  "parts": [
    { "id": "body",    "shape": "sphere", "radii": [0.8, 0.75, 1.25], "position": [0, 1.25, 0], "color": "fur", "bone": "spine" },
    { "id": "chest",   "shape": "sphere", "radii": [0.42, 0.48, 0.32], "position": [0, 1.2, 1.0], "color": "cream", "bone": "chest" },
    { "id": "stripe_1","shape": "sphere", "radii": [0.55, 0.1, 0.14], "position": [0, 1.91, -0.5], "color": "stripe", "bone": "hips" },
    { "id": "stripe_2","shape": "sphere", "radii": [0.55, 0.1, 0.14], "position": [0, 1.97, 0], "color": "stripe", "bone": "spine" },
    { "id": "stripe_3","shape": "sphere", "radii": [0.55, 0.1, 0.14], "position": [0, 1.91, 0.5], "color": "stripe", "bone": "chest" },
    { "id": "haunch_l","shape": "sphere", "radii": [0.32, 0.52, 0.52], "position": [0.52, 0.95, -0.7], "color": "fur", "bone": "leg_back_l", "mirror": "x" },
    { "id": "leg_front_l", "shape": "cylinder", "radiusTop": 0.17, "radiusBottom": 0.15, "height": 0.95, "position": [0.42, 0.62, 0.72], "color": "fur", "bone": "leg_front_l", "mirror": "x" },
    { "id": "leg_back_l",  "shape": "cylinder", "radiusTop": 0.17, "radiusBottom": 0.15, "height": 0.95, "position": [0.46, 0.62, -0.7], "color": "fur", "bone": "leg_back_l", "mirror": "x" },
    { "id": "paw_front_l", "shape": "sphere", "radii": [0.2, 0.12, 0.27], "position": [0.42, 0.12, 0.78], "color": "cream", "bone": "leg_front_l", "mirror": "x" },
    { "id": "paw_back_l",  "shape": "sphere", "radii": [0.2, 0.12, 0.27], "position": [0.46, 0.12, -0.64], "color": "cream", "bone": "leg_back_l", "mirror": "x" },
    { "id": "head",    "shape": "sphere", "radii": [0.8, 0.7, 0.7], "position": [0, 2.1, 1.2], "color": "fur", "bone": "head" },
    { "id": "muzzle",  "shape": "sphere", "radii": [0.27, 0.19, 0.2], "position": [0, 1.93, 1.8], "color": "cream", "bone": "head" },
    { "id": "nose",    "shape": "sphere", "radii": [0.09, 0.06, 0.06], "position": [0, 2.02, 1.97], "color": "pink", "bone": "head" },
    { "id": "eye_l",   "shape": "sphere", "radii": [0.1, 0.14, 0.07], "position": [0.3, 2.22, 1.8], "color": "ink", "bone": "head", "mirror": "x" },
    { "id": "ear_l",   "shape": "cone", "radius": 0.3, "height": 0.6, "sides": 4, "position": [0.46, 2.78, 1.1], "rotation": [0, 0, -14], "color": "fur", "bone": "head", "mirror": "x" },
    { "id": "ear_inner_l", "shape": "cone", "radius": 0.18, "height": 0.42, "sides": 4, "position": [0.46, 2.74, 1.18], "rotation": [0, 0, -14], "color": "pink", "bone": "head", "mirror": "x" },
    { "id": "tail", "shape": "tube", "points": [[0, 1.45, -1.1], [0, 1.75, -1.6], [0, 2.3, -1.85], [0, 2.85, -1.75], [0, 3.2, -1.5]],
      "radiusStart": 0.16, "radiusEnd": 0.1, "color": "fur", "bone": "hips", "boneChain": "tail", "chainLength": 4 }
  ]
}
```

Save this as `src/craft/fixtures/cat.json`; it doubles as a test fixture and as the example inside the Claude prompt.

---

## 5. Builder

Location: `src/craft/builder/`. Runs in a Web Worker for geometry creation; the main thread only receives buffers.

### 5.1 Pipeline

```
raw text
  → repair (5.6)
  → parse JSON
  → zod validate + soft fixes      → warnings[]
  → expand mirrors (parts and bones)
  → expand tube bone chains
  → resolve palette colors
  → create geometry per part (detail level)
  → bake color into vertex colors (non-indexed, flat normals)
  → assign skinIndex/skinWeight per part (rigid)
  → merge into one BufferGeometry
  → build Skeleton from bones
  → SkinnedMesh with one MeshStandardMaterial({ vertexColors: true, flatShading: true })
```

One merged mesh with vertex colors keeps draw calls low and exports cleanly to GLB with the skeleton.

### 5.2 Detail mapping

The UI detail slider (1–10) maps to segment counts:

| Shape | Segments at detail d |
|---|---|
| sphere | widthSegments = 2 + d, heightSegments = max(3, round(0.75 × (2 + d))) |
| cylinder, cone, capsule | radial = max(4, 2 + d) |
| torus | radial = 3 + d, tubular = 6 + 2d |
| tube | tubular = 4 × points, radial = max(4, 2 + d) |
| box | bevel segments = d > 6 ? 2 : 1 |

A part's `sides` always wins over the slider. Show the live triangle count.

### 5.3 Mirroring

For a part or bone with `mirror: 'x'`:
- Copy it, set `position.x = −x` (bones: `head.x = −x`, tube: every point's x).
- Rotation: `[rx, −ry, −rz]`.
- Rename `_l` → `_r` in `id`, `bone`, and bone `name`/`parent` (only the suffix).
- If the original sits at x = 0, skip the copy and warn.

### 5.4 Tube bone chains

For a tube with `boneChain: "tail"` and `chainLength: n`:
- Sample the curve (CatmullRom through `points`) at n + 1 evenly spaced positions.
- Create bones `tail_1` … `tail_n`, with `tail_1.parent = part.bone`, each next bone parented to the previous, heads at the sampled positions.
- Skin tube vertices **smoothly** to the two nearest chain bones by curve parameter (linear blend). This is the one place where weights are not rigid, so tails bend nicely.

### 5.5 Rigid skinning and soft joints

- Every vertex of a normal part gets `skinIndex = [boneIndex, 0, 0, 0]`, `skinWeight = [1, 0, 0, 0]`.
- Optional "soft joints" toggle (default on for limbs): vertices within distance `r` (0.15 × part size) of the part's bone head blend 50/50 with the parent bone. This hides cracks at shoulders and hips during big motions.

### 5.6 Repairing pasted AI output

Language models often wrap or decorate JSON. Before parsing:
1. Trim whitespace; strip Markdown code fences (```json … ```).
2. If there is text around the JSON, extract the first balanced `{ … }` block (bracket matching that respects strings).
3. Parse with **JSON5** (handles trailing commas, comments, single quotes, unquoted keys).
4. If parsing still fails, show the error with line/column and offer a **fix prompt** (section 8.3).

### 5.7 Performance targets
- Build of a 60-part spec at detail 5: under 100 ms on a mid-range laptop.
- Detail slider: rebuild debounced at 60 ms, never blocks the UI.

---

## 6. Bone naming convention

Craft models and Phase 8 rigging share these names so one animation library works for both. Animation generators read bone rest positions for proportions and **skip tracks for bones that don't exist**, so partial skeletons still animate.

| Body type | Required | Optional |
|---|---|---|
| quadruped | root, hips, spine, chest, head, leg_front_l/r, leg_back_l/r | neck, tail_1..n, ear_l/r, jaw, leg_*_lower |
| biped | root, hips, spine, chest, head, arm_l/r, leg_l/r | neck, forearm_l/r, hand_l/r, shin_l/r, foot_l/r, tail_1..n, ear_l/r |
| bird | root, body, head, wing_l/r, leg_l/r | neck, tail_1..n |
| fish | root, body, head, tail_1..n | fin_l/r, fin_top |
| snake | root, segment_1..n (via tube chain), head | jaw |
| object | root | any names; only "any model" animations apply (bounce, spin, wobble...) |

---

## 7. Template library

Location: `src/craft/templates/`. Each template is a pure function plus a parameter schema:

```ts
interface Template<P> {
  id: string;                    // "cat"
  name: string;                  // "Cat"
  bodyType: BodyType;
  params: ParamDef[];            // drives auto-generated sliders, color pickers, selects
  defaults: P;
  build(params: P): ShapeSpec;   // pure, deterministic
  thumbnail: string;             // rendered at build time or lazily, cached
}

type ParamDef =
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number }
  | { key: string; label: string; type: 'color' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'toggle' };
```

Required templates (each must produce a valid spec at every parameter combination):

| Template | Body type | Parameters (at least) |
|---|---|---|
| Cat | quadruped | head size, body length, leg length, tail length, tail curl, ear style (pointy/round/folded), fur color, belly color, pattern (none/stripes/spots/socks) |
| Dog | quadruped | head size, snout length, ear style (up/floppy), leg length, tail style (straight/curly), colors |
| Bunny | quadruped | ear length, ear droop, body roundness, colors |
| Bird | bird | beak size, body roundness, wing length, crest toggle, colors |
| Fish | fish | body length, fin size, tail shape (fork/round), colors |
| Chibi human | biped | head size, body height, hair style (short/long/bun/spiky), outfit colors, skin color |
| Robot | biped | head shape (box/round), antenna toggle, arm length, colors |
| Car | object | body length, wheel size, roof height, colors |

Template rules:
- Proportions change smoothly; no part should ever float free or fully disappear inside another at any slider position. Write a test that samples random params and checks part overlap heuristics (each part's bounding box touches or intersects at least one other part, except decorative tiny parts flagged `detached: true` in code).
- Bone heads move with proportions (longer legs → hips higher).
- Use the TRIDGE palette as default colors.

---

## 8. Ask Claude bridge

### 8.1 Flow

```
[Describe your model]  "a chubby penguin with a red scarf"   (+ optional photo)
[Body type]            auto / quadruped / biped / bird / fish / snake / object
        │
        ▼
[Copy prompt]  → copies the full prompt (8.2) to clipboard
[Open Claude]  → opens https://claude.ai/new in a new tab
        │   user pastes prompt (and attaches the photo if they chose one), copies Claude's answer
        ▼
[Paste answer] → large textarea; also accept a dropped .json file; auto-build on paste
        │
        ├─ valid   → model appears, warnings listed in a collapsible panel
        └─ invalid → error list + [Copy fix prompt] (8.3)
```

After a model exists, a **Refine** box ("make the head bigger", "kasih topi") produces the refine prompt (8.4). Keep a version history of specs so the user can step back.

UI copy notes: explain once, in plain words, that this uses their own Claude.ai account in another tab and that TRIDGE never sees their login. The photo stays on their device; they attach it in Claude themselves.

### 8.2 Create prompt template

Store as `src/craft/prompts/create.md` with `{{placeholders}}`. The app fills them and copies the result. The example and the schema summary are inserted from code so they never drift from the real schema.

```
You are designing a 3D model for TRIDGE, a web app that builds low-poly toy models
from primitive shapes. Reply with ONE JSON object and nothing else: no explanation,
no Markdown, no code fences.

## What to make
{{description}}
{{#if photo}}I attached a photo. Match its overall shape, proportions, and main colors.
Simplify into chunky toy shapes; do not try to copy fine details.{{/if}}
Body type: {{bodyType or "choose the best fit: quadruped, biped, bird, fish, snake, object"}}

## Format (Shape Spec v1)
{{schemaSummary}}

## Coordinate rules
- +Y up, ground at y = 0, the model must stand on the ground.
- +Z is the front. +X is the model's left side.
- Model height between 2 and 4 units.
- Rotations in degrees. Cylinders and cones point up (+Y) before rotation.
- Positions are in model space.

## Style rules
- Cute, chunky, low-poly toy style. Slightly big head, simple readable silhouette.
- 15 to 60 parts. Parts should overlap a little so nothing floats.
- Use "mirror": "x" for every left/right pair. Define only the _l side, with x > 0.
- Use a palette of 3 to 8 colors with descriptive keys.
- Use "sides": 4 on cones for faceted ears, horns, beaks if it suits the style.
- Use a "tube" with "boneChain" for tails, necks, tentacles.

## Bones
Use these names for the body type you chose:
{{boneTable}}
Every part must name the bone it moves with. Place bone "head" values at the joints
(where a leg meets the body, where the neck meets the head).

## Example (a cat)
{{exampleCatJson}}

Now output the JSON for the requested model.
```

### 8.3 Fix prompt template

```
The JSON you gave for TRIDGE has problems. Return the corrected full JSON object only,
no explanation, no Markdown.

Problems:
{{errorList}}        // e.g. "parts[12].bone: 'tail' does not exist; available: hips, tail_1..."

Your previous JSON:
{{previousRawText}}
```

### 8.4 Refine prompt template

```
Here is a TRIDGE Shape Spec v1 model. Apply this change and return the full updated
JSON object only, no explanation, no Markdown. Keep all ids, bone names, and the
palette keys that don't need to change.

Change: {{request}}

Current model:
{{currentSpecJson}}
```

The request may be in Indonesian or English; pass it through unchanged.

---

## 9. Direct API mode (optional)

- Off by default, in Settings → "Use my own API key". Shows a clear note: "This may cost money on your API account. The copy/paste option is free."
- Supported first: Anthropic Messages API. Before implementing, **check the current Anthropic API docs** for the endpoint, required headers for direct browser calls, and current model names. Make the model name a settings field with a sensible default.
- The key is stored only in localStorage, never logged, never included in exported projects. Provide "Forget key".
- Uses the same prompts as the bridge (8.2–8.4) and the same repair/validation path; on validation failure, auto-send the fix prompt once, then show errors to the user.
- Abstract behind `CraftAIProvider { createSpec, fixSpec, refineSpec }` so other providers (for example a free Hugging Face inference endpoint, or an in-browser model) can be added later. Do not add any provider that is not verified to work and to be free or user-paid.

---

## 10. Part editor

Location: `src/craft/editor/`. Available for every Craft model.

- **Select**: click a part in the viewer (raycast against per-part ids kept in a vertex attribute or a side lookup table built during merge). Selected part gets an outline or emissive highlight. A part list panel mirrors the selection.
- **Transform**: `TransformControls` with move/rotate/scale modes; keyboard shortcuts W/E/R; snapping toggle (0.05 units, 15°).
- **Edit fields**: numeric inputs for position/rotation/size, color picker bound to palette keys (changing a palette color updates every part using it), bone dropdown.
- **Mirror-aware**: editing `ear_l` updates `ear_r` too, unless the user unlinks the pair.
- **Actions**: duplicate, delete (with undo, no confirmation), add primitive, toggle mirror.
- **Undo/redo**: stack of spec snapshots (max 50), Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z.
- Editing operates on the **spec**, then rebuilds. The spec is always the single source of truth.
- "Edit bones" sub-mode shows bone heads as draggable markers (reuse the Phase 8 joint marker UI).

---

## 11. Integration with the rest of TRIDGE

- **Generate step**: three source cards, "From photo", "From text", "Craft". Craft opens with two tabs, "Templates" and "Ask Claude"; the editor is available after a model exists.
- **Low poly step**: for Craft models, the slider controls builder detail directly (exact and instant) instead of mesh simplification. Palette editing replaces color quantization.
- **Rig step**: skipped for Craft models (shown as "Already rigged" with a button to adjust bones in the editor).
- **Animate step**: works immediately using bone names from section 6.
- **Export**: GLB includes the skinned mesh, skeleton, and animations. Additionally offer **"Download Shape Spec (.json)"** so a model can be re-imported, shared, or edited by hand.
- **Projects**: store the spec (and template id + params when made from a template), not the merged geometry; rebuild on load.
- **Convert**: an AI-generated model (From photo/text) cannot become a Craft model, but a Craft model can be "frozen" into a regular mesh for further processing.

---

## 12. Testing

Unit (Vitest):
- Schema: valid fixtures pass; each limit violation produces the expected warning or error.
- Repair: fixtures of messy AI output (fenced, with intro text, trailing commas, comments, single quotes, truncated) produce the expected result or a clean error.
- Mirroring: positions, rotations, ids, bone names flip correctly; x = 0 parts are not duplicated.
- Tube chains: correct bone count, parenting, and normalized weights.
- Builder: per template, at default params, part count and triangle count match a snapshot at detail 5.
- Templates: 200 random parameter samples per template all validate with zero hard errors and pass the floating-part heuristic.
- Animation compatibility: for each template, every animation for its body type produces at least one track.

Fixtures folder: `src/craft/fixtures/` with `cat.json`, `penguin.json` (hand-written as if from Claude), and `broken/*.txt` for repair tests.

Manual checklist (add to `TESTING.md`): offline template flow, bridge round trip with and without photo, refine round trip, fix-prompt round trip, editor undo/redo, GLB export re-imported with working animations.

---

## 13. Acceptance criteria

1. Offline: choose Cat, change fur color and leg length, play "walk", export GLB, re-import it, and the animation still plays.
2. Bridge: "a chubby penguin with a red scarf" gives a valid, animated model after one copy/paste round trip with Claude.ai.
3. Pasting messy output (fenced and with intro text) still builds. Pasting broken JSON shows readable errors and a working fix prompt.
4. "Make the head bigger" via Refine changes only the head-related parts.
5. All eight templates render correctly at every detail level and in both themes, and the detail slider never freezes the UI.
6. No code path executes text received from an AI or a pasted file.
