// Copies the ONNX runtime files the background remover needs into public/ort/,
// so they are served from our own origin (no CDN) as plain static files.
import { copyFileSync, mkdirSync } from 'node:fs';

const files = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
const from = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url);
const to = new URL('../public/ort/', import.meta.url);
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(new URL(f, from), new URL(f, to));
console.log(`Copied ${files.length} ONNX runtime files to public/ort/`);
