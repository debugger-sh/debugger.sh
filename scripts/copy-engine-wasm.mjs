/**
 * Copy debugger-sh Wasm + worker scripts into public/ so absolute paths
 * (`/engine_bg.wasm`, `/assets/worker-*.js`) resolve on the static export.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const engineRoot = dirname(dirname(require.resolve('debugger-sh')));
const publicDir = join(root, 'public');

const wasmSrc = join(engineRoot, 'dist/engine_bg.wasm');
const wasmDest = join(publicDir, 'engine_bg.wasm');
mkdirSync(publicDir, { recursive: true });
copyFileSync(wasmSrc, wasmDest);
console.log(`copied ${wasmSrc} -> ${wasmDest}`);

const assetsSrc = join(engineRoot, 'dist/assets');
const assetsDest = join(publicDir, 'assets');
rmSync(assetsDest, { recursive: true, force: true });
mkdirSync(assetsDest, { recursive: true });
for (const name of readdirSync(assetsSrc)) {
  const from = join(assetsSrc, name);
  const to = join(assetsDest, name);
  copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}
