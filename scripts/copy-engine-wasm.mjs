/** Copy debugger-sh's Wasm next to the static export so /engine_bg.wasm resolves. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Prefer the main export path — `./package.json` is not in the package exports map.
const engineRoot = dirname(dirname(require.resolve('debugger-sh')));
const src = join(engineRoot, 'dist/engine_bg.wasm');
const dest = join(root, 'public/engine_bg.wasm');
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`copied ${src} -> ${dest}`);
