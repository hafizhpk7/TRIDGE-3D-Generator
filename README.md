# TRIDGE

TRIDGE turns a picture or a few words into a low-poly 3D model, then rigs it with a skeleton and animates it from plain text such as "walk slowly then jump high". You can then download it, or keep working on it later.

It is free to use and free to run. It is a static website: there is no server of its own and no account. Your projects are kept in your own browser.

## What you can do

1. **Input.** Start from a photo (the background can be removed on your device), from words (a free online model draws the picture), or from **Craft**, which builds a toy-like model out of simple shapes with no AI needed.
2. **Generate.** A free online model turns the picture into 3D. If one is busy or offline, TRIDGE says so and tries another. A flat 2.5D relief model is always available as a fallback, made on your device.
3. **Low poly.** Choose how chunky it looks, with a before and after view and a colour palette you can edit.
4. **Rig and animate.** Place a skeleton on a model (joint markers can be dragged), then ask for moves in English or Indonesian.
5. **Export.** GLB (with skeleton and animations), STL and OBJ for 3D printing, PNG (transparent if you like), WebM video, animated GIF, and the Craft recipe as JSON.

Projects save themselves. The **Projects** button lists them with pictures, and each can be saved as a single `.tridge` file for backup or sharing.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints. Other commands:

```bash
npm test          # unit tests
npm run lint      # code checks
npm run build     # production build into dist/
npm run preview   # serve dist/ locally
```

Nothing is installed globally and no system tools are needed. See [TESTING.md](TESTING.md) for a checklist to try the whole flow by hand, and [DEPLOY.md](DEPLOY.md) to put it on the internet for free.

## Free providers and their licenses

Everything here is free to use. Some parts send your picture or words to a free online model; the rest runs on your device.

| What | Model | Runs | License |
| --- | --- | --- | --- |
| Picture to 3D | [TRELLIS](https://huggingface.co/spaces/trellis-community/TRELLIS) | Online (Hugging Face Space) | MIT |
| Picture to 3D, fallback | [Stable Fast 3D](https://huggingface.co/stabilityai/stable-fast-3d) | Online (Hugging Face Space) | Stability AI Community License. Free for personal use and for organisations under US$1 million a year in revenue. Read it before commercial use. |
| Words to picture | [FLUX.1 schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) | Online (Hugging Face Space) | Apache-2.0 |
| Words to picture, fallback | [Z-Image Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) | Online (Hugging Face Space) | Apache-2.0 |
| Background removal | [ormbg](https://huggingface.co/onnx-community/ormbg-ONNX) | On your device | Apache-2.0 |
| Depth for 2.5D relief | [Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small) | On your device | Apache-2.0 |

The full list of libraries and fonts, with licenses, is in the app under **Help, then About and credits**.

**Craft** can optionally call Claude with your own API key. The key is kept in this browser only; it is never written to a project or an export. Without a key, Craft works by copying a prompt to Claude.ai and pasting the answer back.

## Known limitations

- Free online models can be slow, queued, rate-limited or offline. Anonymous use of the free Spaces has a small allowance, so a busy day can mean waiting or using the fallback.
- The back of a model made from one picture is guessed by the AI and can look off.
- Automatic rigging works best on clear shapes with distinct legs, a head and a tail. Odd shapes may need the joint markers moved, or the whole-model motions that need no rig.
- Animations are ready-made moves matched from your words. This is not free-form motion generation.
- Craft models are stylized and built from simple shapes. They look like toys, not scans.
- WebM recording runs in real time and needs the tab in front. Transparent video works in Chrome and Edge. GIFs are limited to 256 colours with hard edges.
- Projects live in your browser's storage. If you clear site data they are gone, so save important ones as `.tridge` files.

## How it is built

Vite, React and TypeScript, with three.js for 3D. Heavy work (low poly, rigging, Craft building, GIF encoding, the on-device models) runs in Web Workers, and big parts of the app load only when first used. Plain CSS with design tokens, no UI framework. Tests use Vitest.

```
src/app        page shell, tour, About, error handling
src/design     buttons, panels, dialogs and other building blocks
src/viewer     the 3D viewer and model loading
src/pipeline   input, text to picture, 3D providers, relief, low poly
src/craft      Craft: Shape Spec, builder, templates, editor
src/rig        skeletons, joint suggestion, skinning
src/animate    animation library, prompt parser, player
src/export     GLB, STL, OBJ, PNG, WebM, GIF
src/projects   saving, the gallery, .tridge files
src/workers    Web Workers
```

TRIDGE is always written in capitals.
