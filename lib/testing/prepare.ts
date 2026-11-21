import { simpleTestRunner } from '@/cs106b/generated/simpleTestRunner';

const HAS_TESTS = /\b(?:PROVIDED_TEST|STUDENT_TEST)\s*\(/;
const HAS_MAIN = /\b(?:int|void|auto|signed)\s+main\s*\(/;

/**
 * Prepares a C++ source for a run. When it has SimpleTest cases, the student's `main` is
 * renamed with a `#define` (so we never parse C++) and the test runner becomes the entrypoint.
 */
export function prepareCppRun(source: string, path: string): { source: string; hasTests: boolean } {
  if (!HAS_TESTS.test(source)) return { source, hasTests: false };

  // The runner calls `original_main` before the tests, so stub it if the student has none.
  // There are no diagnostic pragmas around student code: the toolchain builds with `-Werror`,
  // so a missing return stays a compile error rather than trapping at run time.
  const stub = HAS_MAIN.test(source) ? [] : ['int original_main() { return 0; }', ''];
  return {
    source: [
      '#define main original_main',
      // Breakpoints match the debug info's path exactly, so keep the absolute path.
      `#line 1 "${path}"`,
      source,
      '#undef main',
      '',
      ...stub,
      simpleTestRunner,
    ].join('\n'),
    hasTests: true,
  };
}
