export interface Credit {
  name: string;
  /** What TRIDGE uses it for, in plain words. */
  use: string;
  license: string;
  url: string;
  /** Anything a person should know before relying on it. */
  note?: string;
}

/** Free online models and Spaces. The picture and 3D steps send your picture or words to these. */
export const ONLINE_CREDITS: Credit[] = [
  {
    name: 'TRELLIS (trellis-community)',
    use: 'Makes a 3D model from a picture, on a free Hugging Face Space.',
    license: 'MIT',
    url: 'https://huggingface.co/spaces/trellis-community/TRELLIS',
    note: 'Free Spaces can be slow, queued or offline. Anonymous use has a small daily allowance.',
  },
  {
    name: 'Stable Fast 3D (Stability AI)',
    use: 'The fallback for making a 3D model from a picture.',
    license: 'Stability AI Community License',
    url: 'https://huggingface.co/stabilityai/stable-fast-3d',
    note: 'Free for personal use and for organisations earning under US$1 million a year. Read the license before using results commercially.',
  },
  {
    name: 'FLUX.1 schnell (Black Forest Labs)',
    use: 'Makes a picture from your words.',
    license: 'Apache-2.0',
    url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
  },
  {
    name: 'Z-Image Turbo (Tongyi-MAI)',
    use: 'The fallback for making a picture from your words.',
    license: 'Apache-2.0',
    url: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo',
  },
];

/** Models that run inside your browser. Your picture never leaves your device for these. */
export const LOCAL_CREDITS: Credit[] = [
  {
    name: 'ormbg (Rafał Dąbrowski)',
    use: 'Removes the background from your picture, on your device.',
    license: 'Apache-2.0',
    url: 'https://huggingface.co/onnx-community/ormbg-ONNX',
  },
  {
    name: 'Depth Anything V2 Small (ONNX build)',
    use: 'Estimates depth for the flat 2.5D relief model, on your device.',
    license: 'Apache-2.0',
    url: 'https://huggingface.co/onnx-community/depth-anything-v2-small',
  },
];

/** Code libraries and fonts the app is built from. */
export const LIBRARY_CREDITS: Credit[] = [
  {
    name: 'three.js',
    use: 'Draws and exports 3D.',
    license: 'MIT',
    url: 'https://threejs.org',
  },
  {
    name: 'Transformers.js and ONNX Runtime Web',
    use: 'Runs the picture models in your browser.',
    license: 'Apache-2.0 and MIT',
    url: 'https://huggingface.co/docs/transformers.js',
  },
  {
    name: 'Gradio JavaScript client',
    use: 'Talks to the free Spaces.',
    license: 'Apache-2.0',
    url: 'https://www.gradio.app',
  },
  {
    name: 'meshoptimizer',
    use: 'Reduces triangles for the low-poly step.',
    license: 'MIT',
    url: 'https://github.com/zeux/meshoptimizer',
  },
  {
    name: 'React, React Router, zustand, zod, JSON5',
    use: 'The app itself.',
    license: 'MIT',
    url: 'https://react.dev',
  },
  {
    name: 'fflate and gifenc',
    use: 'Pack .tridge project files and animated GIFs.',
    license: 'MIT',
    url: 'https://github.com/101arrowz/fflate',
  },
  {
    name: 'Bagel Fat One and Nunito',
    use: 'The fonts you are reading.',
    license: 'SIL Open Font License 1.1',
    url: 'https://fontsource.org',
  },
];

/** Things that are true of this app and worth knowing, kept honest and short. */
export const LIMITS: string[] = [
  'Free online models can be slow, queued, rate-limited or offline. When one is down, TRIDGE says so and tries another.',
  'The back of a model made from one picture is guessed by the AI and can look off.',
  'Automatic rigging works best on clear shapes with distinct legs, a head and a tail. Odd shapes may need the joint markers moved, or the whole-model motions that need no rig.',
  'Animations are ready-made moves matched from your words. This is not free-form motion generation.',
  'Craft models are stylized and built from simple shapes. They look like toys, not scans.',
];
