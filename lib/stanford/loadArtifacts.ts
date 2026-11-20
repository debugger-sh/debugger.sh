/**
 * Mounts the precompiled Stanford CS106B library (headers, `cs106b.a`, PCH and
 * dictionary — see cs106b/scripts/build-precompiled.mjs) into the engine.
 * Isolated from the rest of the IDE — call only from the C/C++ run path.
 */

import type { CppOptions, Engine } from 'debugger-sh';

import { bundleDigest } from '@/cs106b/generated/precompiled';

/** Toolchain flags that build every C++ program against the mounted library. */
export const stanfordCppOptions = {
  cxxFlags: ['-include-pch', '/__cs106b/support.pch'],
  lldFlags: ['/__cs106b/cs106b.a'],
} satisfies CppOptions;

const mounted = new WeakMap<Engine, Promise<void>>();

async function fetchBundle(): Promise<Uint8Array> {
  const response = await fetch('/cs106b/cs106b.tar.gz');
  if (!response.ok) throw new Error(`Cannot load CS106B library: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (digest !== bundleDigest) throw new Error('CS106B library digest mismatch');
  return bytes;
}

/** Mounts the library into `engine`'s filesystem (once per engine). */
export function mountStanfordArtifacts(engine: Engine): Promise<void> {
  let pending = mounted.get(engine);
  if (!pending) {
    pending = fetchBundle()
      .then((bundle) => engine.fs.mount(bundle))
      .catch((error: unknown) => {
        mounted.delete(engine);
        throw error;
      });
    mounted.set(engine, pending);
  }
  return pending;
}
