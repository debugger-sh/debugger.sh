/**
 * Loads precompiled Stanford CS106B archives/PCH for the forked engine.
 * Isolated from the rest of the IDE — call only from the C/C++ run path.
 */

import { artifactHashes } from '@/cs106b/generated/precompiled';
import { stanfordHeaders } from '@/cs106b/generated/headers';
import type { CppArtifacts } from 'debugger-sh';

export type StanfordRuntimeInputs = {
  /** Text headers (and prelude) merged into engine.fs for includes + PCH validation. */
  fsFiles: Record<string, string>;
  binaryFiles: Record<string, Uint8Array>;
  cppArtifacts: CppArtifacts;
};

let pending: Promise<StanfordRuntimeInputs> | null = null;

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

/** Loads the non-debug Stanford archive (`cs106b.a`) used for both run and debug. */
export function loadStanfordArtifacts(): Promise<StanfordRuntimeInputs> {
  if (!pending) {
    pending = (async () => {
      const [archive, pch, dictionary] = await Promise.all([
        fetchArtifact('cs106b.a'),
        fetchArtifact('support.pch'),
        fetchArtifact('EnglishWords.dat'),
      ]);
      return {
        // Headers stay as text FS nodes so `#include "map.h"` / `"SimpleTest.h"` work.
        fsFiles: stanfordHeaders,
        binaryFiles: {
          '/__cs106b/cs106b.a': archive,
          '/__cs106b/support.pch': pch,
          '/__cs106b/EnglishWords.dat': dictionary,
        },
        cppArtifacts: {
          archives: ['/__cs106b/cs106b.a'],
          precompiledHeader: '/__cs106b/support.pch',
        },
      };
    })().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
