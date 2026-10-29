/**
 * Loads precompiled Stanford CS106B archives/PCH for the forked engine.
 * Isolated from the rest of the IDE — call only from the C/C++ run path.
 */

import { artifactHashes } from '@/cs106b/generated/precompiled';
import { stanfordHeaders } from '@/cs106b/generated/headers';
import { SIMPLETEST_H } from '@/lib/simpletest/embedded';
import type { CppArtifacts } from 'debugger-sh';

export type StanfordRuntimeInputs = {
  /** Text headers (and prelude) merged into engine.fs for includes + PCH validation. */
  fsFiles: Record<string, string>;
  binaryFiles: Record<string, Uint8Array>;
  cppArtifacts: CppArtifacts;
};

const pending = new Map<string, Promise<StanfordRuntimeInputs>>();

async function fetchArtifact(name: keyof typeof artifactHashes): Promise<Uint8Array> {
  const response = await fetch(`/cs106b/${name}`);
  if (!response.ok) throw new Error(`Cannot load CS106B artifact ${name}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (digest !== artifactHashes[name]) {
    throw new Error(`CS106B artifact digest mismatch: ${name}`);
  }
  return bytes;
}

/**
 * @param mode `debug` when the DAP debugger is enabled (matches DWARF-built archive).
 */
export function loadStanfordArtifacts(mode: 'run' | 'debug'): Promise<StanfordRuntimeInputs> {
  let result = pending.get(mode);
  if (!result) {
    result = (async () => {
      const archiveName = mode === 'debug' ? 'debug.a' : 'run.a';
      const [archive, pch, dictionary] = await Promise.all([
        fetchArtifact(archiveName),
        fetchArtifact('support.pch'),
        fetchArtifact('EnglishWords.dat'),
      ]);
      return {
        // Headers stay as text FS nodes so `#include "map.h"` / `"SimpleTest.h"` work.
        // SimpleTest is treated as part of the Stanford support surface.
        fsFiles: { ...stanfordHeaders, 'SimpleTest.h': SIMPLETEST_H },
        binaryFiles: {
          [`/__cs106b/${archiveName}`]: archive,
          '/__cs106b/support.pch': pch,
          '/__cs106b/EnglishWords.dat': dictionary,
        },
        cppArtifacts: {
          archives: [`/__cs106b/${archiveName}`],
          precompiledHeader: '/__cs106b/support.pch',
        },
      };
    })().catch((error: unknown) => {
      pending.delete(mode);
      throw error;
    });
    pending.set(mode, result);
  }
  return result;
}
