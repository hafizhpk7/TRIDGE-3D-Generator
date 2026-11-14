# TRIDGE — Build Prompt for Claude Code

You are helping me build **TRIDGE**, a free, browser-based web app that turns an image (or a text prompt) into a **low-poly 3D model**, then lets me **rig and animate** that model with poses and motions I ask for (for example: "cat jumping", "cat walking", "kucing loncat").

Work through this document **phase by phase**. At the end of every phase, stop, summarize what you built, tell me how to test it, and wait for my go-ahead before starting the next phase.

---

## 0. Ground rules

### Product rules
- The app name is **TRIDGE**. Always write it in uppercase. Never expand it or explain what it stands for anywhere in the UI, README, or metadata.
- Everything must be **free to run and free to use**. No paid APIs, no required credit cards, no paid hosting. Paid services may only appear as optional, clearly labeled extras that are off by default.
- Model sources: **From photo**, **From text**, and **Craft** (built from shapes, see Phase 7 and `docs/TRIDGE_CRAFT_SPEC.md`).
- The app must work as a **static site** (no custom backend server). All processing happens either in the browser or through free public endpoints (Hugging Face Spaces via Gradio).
- Users may type requests in **English or Indonesian**. Animation prompts must understand both (e.g. "jump" and "loncat").

### Engineering rules
- Use only **project-local npm dependencies**. Do not require global installs or system tools on my machine (no Python, Blender, CUDA, Docker). If something truly needs a tool I may not have, tell me first and propose a browser-only alternative.
- Before writing any integration with an external model or Hugging Face Space, **verify that it is currently online, what its API endpoint and inputs/outputs are, and what its license allows**. Do not guess endpoint names. If a Space is down or changed, pick another and tell me.
- Keep generation backends behind a **provider interface** so Spaces can be swapped without touching UI code.
- Heavy mesh work (simplification, skinning weights, color quantization) runs in **Web Workers** so the UI never freezes.
- Commit at the end of each phase with a clear message.
- Write small, readable modules. Add unit tests (Vitest) for pure logic: mesh utilities, prompt parsing, animation generators.

### Tech stack
- **Vite + React + TypeScript**
- **three.js** for rendering (`GLTFLoader`, `GLTFExporter`, `OrbitControls`, `SkinnedMesh`, `AnimationMixer`)
- **@gradio/client** for Hugging Face Spaces
- **meshoptimizer** (WASM, npm) for mesh simplification, with three.js `SimplifyModifier` as a fallback
- **@huggingface/transformers** (Transformers.js) for in-browser models (background removal, depth estimation)
- **IndexedDB** (via `idb`) for saving projects locally
- **Zustand** for app state
- Plain CSS with CSS custom properties (no CSS framework), so the design system stays distinctive

### Suggested structure
```
src/
  app/            # layout, routing, global state
  design/         # tokens.css, components (Button, Slider, Panel, Toast...)
  viewer/         # three.js scene, turntable, controls, lighting
  pipeline/
    input/        # upload, crop, background removal
    providers/    # image-to-3D and text-to-image providers (HF Spaces, fallback)
    lowpoly/      # simplify, flat shading, color quantization (workers)
    relief/       # depth-map fallback mesh
  craft/          # Shape Spec schema, builder, templates, Claude bridge, part editor
  rig/            # skeleton templates, joint placement, auto skinning
  animate/        # animation library, prompt parser, sequencer
  export/         # GLB/OBJ/STL/PNG/WebM export
  storage/        # IndexedDB projects
  workers/
public/
  tridge-logo.svg
  tridge-icon.svg
```

---

## Design direction: fun and colorful

I'm providing two logo files (`tridge-logo.svg`, `tridge-icon.svg`). Put them in `public/`, use the icon as the favicon, and build the visual language around them.

**Concept: "candy facets."** Everything feels like a shiny low-poly toy sticker: bright faceted colors, thick dark ink outlines, hard offset shadows, chunky rounded shapes. Playful, but tidy and easy to use.

### Tokens
| Token | Light | Dark |
|---|---|---|
| `--bg` | `#EEF0FF` (pale periwinkle) | `#1B1640` (deep indigo) |
| `--surface` | `#FFFFFF` | `#2A2360` |
| `--ink` (outlines, text) | `#22184A` | `#F4F1FF` |
| `--pink` | `#FF6B9D` | same |
| `--orange` | `#FF9F43` | same |
| `--yellow` | `#FFD43B` | same |
| `--mint` | `#3DD9B0` | same |
| `--sky` | `#4DABF7` | same |
| `--violet` | `#9B7BFF` | same |

- **Type:** "Bagel Fat One" (Google Fonts) for headings and big buttons; "Nunito" for body and UI text. Sentence case everywhere. Fallback stacks required.
- **Shape:** borders `3px solid var(--ink)`; radius varies by hierarchy (large panels 24px, buttons 16px, chips 999px); hard offset shadows like `4px 5px 0 var(--ink)` instead of soft grey blur.
- **Buttons:** pressing a button moves it down into its shadow (translate + shadow shrink) for a tactile feel.
- **Background:** a subtle faceted triangle pattern (SVG, low contrast) behind the workspace.
- **Signature moment:** when a model finishes generating, burst a short confetti of colored triangles from the viewer. This is the one big celebratory animation; keep the rest of the motion small and purposeful.
- **Viewer:** the 3D model sits on a round "toy pedestal" turntable with soft colored rim lights.
- **Copy:** short, friendly, plain. Buttons say exactly what they do ("Make 3D model", "Add animation", "Download GLB"). Errors explain what happened and what to do next, without apologizing.
- **Quality floor:** responsive down to 360px wide, visible keyboard focus, `prefers-reduced-motion` respected (disable confetti and auto-rotate), text contrast at least WCAG AA, light and dark mode via `prefers-color-scheme` plus a manual toggle.

### Main layout
```
┌──────────────────────────────────────────────────────────┐
│ [logo]                         [projects] [theme] [help] │
├───────────────┬──────────────────────────┬───────────────┤
│ 1 Input       │                          │ Tools panel   │
│  upload/text  │      3D viewer           │  (tabs)       │
│ 2 Generate    │    on toy pedestal       │  Low poly     │
│ 3 Low poly    │                          │  Rig          │
│ 4 Animate     │                          │  Animate      │
│ 5 Export      │  [timeline / controls]   │  Export       │
└───────────────┴──────────────────────────┴───────────────┘
```
The left column is a step tracker (it really is a sequence, so numbered steps are appropriate). On mobile, the viewer goes on top and panels become a bottom sheet.

---

## Phase 1 — Project setup and design system

**Goal:** a running app shell that already looks like TRIDGE.

Tasks:
1. Scaffold Vite + React + TypeScript. Add ESLint, Prettier, Vitest.
2. Add logo files to `public/`, set favicon, page title "TRIDGE".
3. Create `design/tokens.css` with all tokens above, light and dark.
4. Build base components: `Button` (primary, secondary, ghost), `IconButton`, `Slider`, `Toggle`, `Tabs`, `Panel`, `Chip`, `Toast`, `Modal`, `ProgressBar` (with an indeterminate "queue" state), `EmptyState`.
5. Build the main layout with the step tracker and placeholder panels.
6. Theme toggle (system / light / dark), persisted in localStorage.
7. A small `/playground` route showing every component in every state, for review.

**Acceptance:** app runs with `npm run dev`; layout is responsive; both themes look intentional; keyboard navigation works across all components.

---

## Phase 2 — 3D viewer foundation

**Goal:** a delightful viewer that can load and show any GLB.

Tasks:
1. three.js scene with renderer, camera, `OrbitControls`, toy pedestal, colored rim lights, soft ground shadow.
2. Load a sample GLB (bundle one small CC0 model) and auto-frame it (fit camera to bounding box, center on pedestal).
3. Controls: auto-rotate toggle, reset view, wireframe toggle, flat/smooth shading toggle, background color chips.
4. Stats chip: triangle count, vertex count, file size.
5. Drag-and-drop or open a local `.glb/.gltf/.obj` file to view it.
6. Clean disposal of geometries/materials/textures when switching models (no memory leaks).

**Acceptance:** sample model loads, frames correctly, all toggles work, switching models 20 times does not grow memory noticeably.

---

## Phase 3 — Image input and preprocessing

**Goal:** turn a user's photo into a clean input for 3D generation.

Tasks:
1. Upload via drag-and-drop, file picker, or paste from clipboard. Accept PNG/JPG/WEBP, max ~10 MB.
2. Crop and center tool (square output), with a preview.
3. In-browser background removal with a Transformers.js model. Check the model's license first and tell me what it allows. Show a before/after toggle and let the user skip this step.
4. Resize to the size the chosen provider expects.
5. Tips panel: "Best results: one object, plain background, full object visible."

**Acceptance:** a photo of a cat on a messy background becomes a centered cat on transparent background, entirely in the browser.

---

## Phase 4 — Image-to-3D generation (free providers)

**Goal:** generate a real 3D model from the prepared image.

Tasks:
1. Define a `Provider` interface:
   ```ts
   interface ImageTo3DProvider {
     id: string; name: string; license: string;
     healthCheck(): Promise<'online' | 'busy' | 'offline'>;
     generate(image: Blob, opts: GenOptions, onProgress: (p: Progress) => void,
              signal: AbortSignal): Promise<Blob /* GLB */>;
   }
   ```
2. Research which free image-to-3D Hugging Face Spaces are currently online (candidates to check: TRELLIS, Hunyuan3D-2, Stable Fast 3D, TripoSR, or newer ones). Report to me: Space name, endpoint, inputs/outputs, typical wait time, license. Then implement at least **two** providers so one can be a fallback.
3. Health check on load; show provider status chips (online / busy / offline). Auto-fallback to the next provider on failure.
4. Progress UI: queue position if available, elapsed time, cancel button. Friendly messages for quota errors ("Free GPU quota reached. Try again later or use the other provider."), timeouts and Space sleeping.
5. Optional field for the user's own free Hugging Face token (improves quota), stored only in localStorage, with a clear note on what it's for. Never log it.
6. Load the returned GLB into the viewer, trigger the triangle confetti.

**Acceptance:** with at least one Space online, a cat image produces a viewable 3D cat; when a Space is offline, the app falls back automatically or explains clearly what to do.

---

## Phase 5 — Low-poly pipeline

**Goal:** make the generated model look properly low poly, with user control.

Tasks:
1. Simplification in a Web Worker using meshoptimizer (target triangle count, preserve borders where possible). Fallback to `SimplifyModifier`.
2. Slider from "chunky" (~300 triangles) to "detailed" (~20k), plus presets: Ultra low, Low, Medium. Show live triangle count.
3. Flat shading (non-indexed geometry, recomputed face normals).
4. Color options:
   - keep original texture,
   - bake texture to **per-face colors** (sample texture at face centroid),
   - quantize to a small palette (k-means, 4–16 colors) for a clean toy look, with the palette shown as editable swatches.
5. Before/after split view.
6. Debounced, cancellable processing so slider dragging stays smooth.

**Acceptance:** a dense generated mesh can be reduced to ~500 triangles with flat facets and a 6-color palette in a few seconds without freezing the UI.

---

## Phase 6 — Fallbacks and text-to-3D

**Goal:** the app always produces something, and can start from text.

Tasks:
1. **Relief fallback (no server):** depth estimation with Transformers.js, convert depth map to a displaced grid mesh, cut away background, simplify, flat shade. Label it clearly as "2.5D relief" in the UI.
2. **Text-to-3D:** text prompt → free text-to-image Space (verify one that is online and allows this use) → Phase 3 preprocessing → Phase 4 generation. Add a prompt helper that appends style hints ("single object, centered, plain background, low poly toy").
3. Show up to 4 generated images and let the user pick one before making the 3D model.

**Acceptance:** with all 3D Spaces offline, the user still gets a relief model; text "a cute orange cat" leads to a 3D cat.

---

## Phase 7 — Craft mode (models built from code)

**Goal:** a third way to make a model, next to "From photo" and "From text": the model is **built from primitive shapes described as data**, the same way Claude builds a 3D model by writing code. It works offline, never depends on a GPU Space, and every model comes **pre-rigged**.

The full technical specification is in **`docs/TRIDGE_CRAFT_SPEC.md`**. Read it completely before starting this phase and follow it as the source of truth for the data format, builder, safety rules, prompts, and templates.

Summary of what to build:
1. **Shape Spec v1**: a declarative JSON format (parts made of sphere, box, cylinder, cone, capsule, torus, with position, rotation, scale, color, parent, mirror, and the bone each part belongs to). Validate with a schema. **Never execute code produced by an AI**; only data is accepted.
2. **Builder**: Shape Spec → three.js meshes, with the detail slider mapped to segment counts, flat shading, palette colors, mirror expansion, and a rigid-skinned `SkinnedMesh` so animations from Phase 9 work right away.
3. **Template library** (works offline): at least cat, dog, bunny, bird, fish, chibi human, robot, and car, each with parameter sliders (head size, leg length, tail length, ear style, colors, pattern).
4. **"Ask Claude" bridge** (free): TRIDGE writes a ready-made prompt (from the user's description and optional photo), the user copies it into Claude.ai, then pastes the JSON answer back. Includes repair of common formatting mistakes, clear validation errors, and a "fix prompt" for retries. Also a "refine" prompt that sends the current spec with a change request ("make the head bigger").
5. **Optional direct API mode**, off by default: the user may paste their own API key to skip copy/paste. Clearly labeled as possibly paid; the free bridge stays the default.
6. **Part editor**: select a part in the viewer, move/rotate/scale with gizmos, change color, duplicate, mirror, delete, undo/redo.
7. Craft models skip the image pipeline and go straight to the Low poly, Animate, and Export steps.

**Acceptance:** with no internet connection, a user can pick the cat template, change its colors and proportions, and play the walk animation. With the bridge, "a chubby penguin with a red scarf" produces a valid, animated model after one copy/paste round trip.

---

## Phase 8 — Rigging

**Goal:** give the model a skeleton so it can move. This is the hardest part, so build it in layers.

Models made in Craft mode (Phase 7) already include a skeleton and skip this phase. Use the same bone names here as in the Craft templates so one animation library serves both.

### Layer A: no-rig motion (always works)
Whole-object procedural motion that works on any mesh with zero rigging: bounce, hop, spin, wobble, squash and stretch, float, shake. Deform with simple vertex shaders or object transforms. This guarantees every model can be animated.

### Layer B: template skeleton with guided placement (main path)
1. User picks a body type: **Quadruped** (cat, dog, horse), **Biped** (human, robot, bear standing), **Bird**, **Snake/Fish**, **Object**.
2. Each type has a skeleton template (e.g. quadruped: hips, spine ×2, chest, neck, head, tail ×3, four legs with upper/lower/paw).
3. Auto-suggest joint positions from the mesh bounding box and shape (e.g. detect head side, leg columns from vertex distribution). Show joints as colored draggable markers in the viewer, with a mirror-symmetry toggle (editing the left leg updates the right).
4. **Auto skinning** in a Web Worker: compute bone weights (start with distance-to-bone-segment weights with smooth falloff, limited to 4 influences per vertex, normalized; improve with a simple smoothing pass over neighboring vertices). Create a `SkinnedMesh`.
5. Weight preview mode (color per bone) and a quick "test pose" slider to check deformation.

### Layer C: AI auto-rigging (optional, if available)
Research whether a free, online Space exists for automatic rigging (candidates to check: UniRig, Puppeteer, or newer). If one is online and its license allows it, add it as an optional "Auto rig with AI" button whose result can still be adjusted with Layer B markers. If none is available, skip this layer and tell me.

**Acceptance:** a low-poly cat can be rigged as a quadruped in under a minute of user effort, and bending a leg bone deforms the mesh without major tearing.

---

## Phase 9 — Animation from prompts

**Goal:** I type "cat jumping" or "kucing jalan" and the model performs it.

Tasks:
1. **Animation library**, generated procedurally as three.js `AnimationClip`s so they adapt to the model's actual bone lengths:
   - Quadruped: idle (breathing), walk, trot, run, jump, sit, lie down, stretch, tail wag, look around.
   - Biped: idle, walk, run, jump, wave, dance, sit, clap.
   - Bird: idle, hop, flap, fly loop. Snake/Fish: slither, swim.
   - Any model (no rig): bounce, hop, spin, wobble, squash and stretch, float.
2. Each animation has parameters: speed, intensity, loop on/off, duration. Walk/run cycles use proper gait timing (quadruped walk with alternating diagonal leg phases).
3. **Prompt parser** (no paid AI): map free text to `{ animation, params }` using a bilingual synonym dictionary, for example:
   - jump / leap / loncat / lompat → `jump`
   - walk / jalan → `walk`; run / lari → `run`
   - sit / duduk → `sit`; sleep / tidur / rebahan → `lie_down`
   - wave / dadah / melambai → `wave`; dance / joget / nari → `dance`
   - modifiers: fast / cepat, slow / pelan, big / tinggi / heboh, small / kecil
   - sequences: "walk then jump" / "jalan terus loncat" → a queued sequence
   Unknown requests get a friendly reply with clickable suggestions. Keep the dictionary in a JSON file so I can extend it.
4. Show animation suggestions as colorful chips based on the chosen body type.
5. **Sequencer/timeline:** stack multiple clips (e.g. walk → jump → sit), crossfade between them, play/pause/scrub, speed control, loop the whole sequence.
6. "Pose mode": pick a single frame as a static pose and save it.
7. Optional, behind a toggle and only if a free online option exists: an AI interpretation step for unusual prompts. The dictionary parser must remain the default and work offline.

**Acceptance:** typing "kucing jalan pelan terus loncat tinggi" makes the cat walk slowly, then jump high, smoothly blended.

---

## Phase 10 — Export

**Goal:** take the creation anywhere.

Tasks:
1. **GLB** with skeleton and all animation clips (`GLTFExporter`, binary, animations included). Verify by re-importing into the viewer.
2. **OBJ** and **STL** (static, current pose) for 3D printing.
3. **PNG** snapshot with transparent background option.
4. **WebM** video of the current animation via `canvas.captureStream()` + `MediaRecorder`, with optional transparent background where supported. Optional GIF export if a lightweight free library works well.
5. Export panel showing file size estimates and what each format contains.

**Acceptance:** exported GLB opens in a standard glTF viewer with animations playing.

---

## Phase 11 — Projects and gallery

**Goal:** never lose work, no account needed.

Tasks:
1. Save projects to IndexedDB: source image, generated GLB, low-poly settings, rig, animation sequence, thumbnail.
2. Gallery view with thumbnails, rename, duplicate, delete (with confirmation).
3. Autosave after each completed step.
4. Import/export a project as a single `.tridge` file (zip of JSON + assets) for backup or sharing.
5. Storage usage indicator and a clear warning when the browser storage is nearly full.

**Acceptance:** refreshing the page or closing the browser keeps all projects.

---

## Phase 12 — Polish

Tasks:
1. First-run onboarding: three short steps over the real UI, skippable.
2. Empty states that invite action ("Drop a picture of something you love").
3. Error states for every failure path with a next step.
4. Optional UI sounds (off by default) for generate done, export done.
5. Performance: lazy-load heavy modules (Transformers.js, workers) only when needed; keep initial bundle small; check 60fps viewer on a mid-range laptop.
6. Accessibility pass: labels, focus order, screen reader announcements for long tasks, reduced motion.
7. Mobile pass: bottom sheet panels, touch-friendly joint markers.

**Acceptance:** Lighthouse accessibility ≥ 90, no layout breaks at 360px, the whole flow is usable on a phone.

---

## Phase 13 — Testing, docs, and deploy

Tasks:
1. Unit tests for: Shape Spec validation and repair, Craft builder (part and triangle counts per template), simplification wrapper, color quantization, prompt parser (EN + ID cases), animation generators (clip duration, bone tracks), skin weight normalization.
2. A short manual test checklist in `TESTING.md` covering the full flow.
3. `README.md`: what TRIDGE does, how to run it locally, which free providers it uses and their licenses, known limitations.
4. Deploy as a static site to Cloudflare Pages or GitHub Pages (free tier). Give me step-by-step instructions I can follow in the browser.
5. An in-app "About" panel listing model credits and licenses.

**Acceptance:** the deployed URL works end to end with at least one provider online.

---

## Known limitations to be honest about in the UI
- Free Spaces can be slow, queued, rate-limited, or offline. The app should say so plainly and offer the fallback.
- The back side of generated models is guessed by the AI and may look off.
- Auto rigging works best on clear shapes (distinct legs, head, tail). Weird shapes may need manual marker adjustment or the no-rig motions.
- Animations are procedural presets matched from text, not fully free-form motion generation.
- Craft models are stylized and built from simple shapes; they look like toys, not scans.

---

## How to work with me
- Start with Phase 1. Before coding, give me a short plan for the phase.
- At the end of each phase: summary, how to test, screenshots if you can, anything you were unsure about.
- If something in this document turns out to be impossible for free, stop and propose the closest free alternative instead of silently changing scope.
