/**
 * When the student source has SimpleTest cases, splice in a runner that owns
 * `main`. Student `main` is renamed with a preprocessor define so we never
 * have to parse C++. Test keys are left empty — SimpleTest.cpp hashes them.
 */

import { simpleTestRunner } from '@/cs106b/generated/simpleTestRunner';

export type PreparedCppRun = {
  /** Files to merge into engine.fs (besides Stanford headers / student main). */
  files: Record<string, string>;
  /** Absolute virtual paths that must be compiled (in addition to selected student sources). */
  extraSources: string[];
  /** Whether this run uses the injected test runner as the entrypoint. */
  hasTests: boolean;
  nonce: string;
};

const HAS_TESTS = /\b(?:PROVIDED_TEST|STUDENT_TEST)\s*\(/;
const HAS_MAIN = /\b(?:int|void|auto|signed)\s+main\s*\(/;

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when the student source declares at least one SimpleTest block. */
export function sourceHasTests(source: string): boolean {
  return HAS_TESTS.test(source);
}

/**
 * Prepare C/C++ sources for a Run. When tests are present, `#define`s student
 * `main` away and appends the SimpleTest runner as the real entrypoint.
 */
export function prepareCppRun(studentSource: string, studentPath = 'main.c'): PreparedCppRun {
  if (!sourceHasTests(studentSource)) {
    return { files: { [studentPath]: studentSource }, extraSources: [], hasTests: false, nonce: '' };
  }

  const nonce = randomNonce();
  // DAP sets breakpoints on the absolute virtual path (e.g. `/main.c`). The
  // engine matches DWARF paths with exact equality, so `#line` must use that
  // same absolute path — a relative `main.c` will never hit.
  const dapPath = studentPath.startsWith('/') ? studentPath : `/${studentPath}`;
  // Fold the tiny runner into the student TU. SimpleTest.cpp lives in the
  // precompiled CS106B archive (cs106b.a), so a test run is one clang
  // invocation instead of three — the engine reloads ~75MB clang wasm per file.
  const runnerBody = simpleTestRunner.replace(/^#include\s+"SimpleTest(?:_config)?\.h"\s*\n/gm, '');

  // No diagnostic pragmas around student code: the engine builds with `-Werror`,
  // and silencing `-Wreturn-type` let missing returns compile then trap as
  // `[ide error]`. Fall-off `main` (legal in C++) becomes an error after the
  // rename — students should `return 0;` (or omit `main` when using tests).
  //
  // The runner always calls `original_main` before SimpleTest. If the student
  // has no main, inject a no-op stub (same TU can't use a weak default).
  const stub = HAS_MAIN.test(studentSource) ? [] : ['int original_main() { return 0; }', ''];
  const preparedSource = [
    '#define main original_main',
    `#line 1 "${dapPath}"`,
    studentSource,
    '#undef main',
    '',
    ...stub,
    '#include "SimpleTest_config.h"',
    runnerBody,
  ].join('\n');

  return {
    hasTests: true,
    nonce,
    files: {
      [studentPath]: preparedSource,
      'SimpleTest_config.h': [
        `#define SIMPLETEST_NONCE "${nonce}"`,
        `#define SIMPLETEST_ALL true`,
        `#define SIMPLETEST_SELECTION std::vector<std::string>{}`,
        '',
      ].join('\n'),
    },
    extraSources: [],
  };
}
