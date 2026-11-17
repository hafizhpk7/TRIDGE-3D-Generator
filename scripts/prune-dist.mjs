// Runs after the build. Two jobs:
//  1. Remove the ONNX "asyncify" WebAssembly file that the bundler copies into dist/assets. The app serves its own
//     copy of the runtime from dist/ort/ (see src/workers/ortRuntime.ts), so this 27 MB file is never requested.
//  2. Fail loudly if any file is too big for Cloudflare Pages (25 MiB per file).
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const LIMIT = 25 * 1024 * 1024;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

let removed = 0;
for (const file of walk(join(dist, 'assets'))) {
  if (/ort-wasm.*\.wasm$/.test(file)) {
    const mb = (statSync(file).size / 1048576).toFixed(1);
    rmSync(file);
    removed++;
    console.log(`Removed unused ${file.split(/[\/]/).pop()} (${mb} MB)`);
  }
}

const tooBig = walk(dist).filter((f) => statSync(f).size > LIMIT);
if (tooBig.length) {
  for (const f of tooBig) console.error(`Too big for Cloudflare Pages (over 25 MiB): ${f}`);
  process.exit(1);
}
console.log(`dist is ready to deploy (${removed} unused file${removed === 1 ? '' : 's'} removed).`);
