/**
 * Detect PROVIDED_TEST / STUDENT_TEST, rewrite macros with stable keys,
 * rename user main → original_main (normalized to argc/argv),
 * and assemble the filesystem overlay for a test run.
 *
 * SimpleTest.h is always available via the Stanford support FS (like map.h).
 * This module only rewrites + injects the runner when live tests are present.
 */

import { SIMPLETEST_CPP, SIMPLETEST_RUNNER } from '@/lib/simpletest/embedded';

export type PreparedCppRun = {
  /** Files to merge into engine.fs (besides Stanford headers / student main). */
  files: Record<string, string>;
  /** Absolute virtual paths that must be compiled (in addition to selected student sources). */
  extraSources: string[];
  /** Whether this run uses the injected test runner as the entrypoint. */
  hasTests: boolean;
  nonce: string;
};

type SourceToken = { value: string; start: number; end: number };

function isIdentifierStart(character: string): boolean {
  return /[A-Za-z_]/.test(character);
}
function isIdentifierPart(character: string): boolean {
  return /[A-Za-z0-9_]/.test(character);
}

function quotedLiteralEnd(source: string, start: number, quote: '"' | "'"): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function rawStringLiteralEnd(source: string, start: number): number | undefined {
  const prefixes = ['u8R"', 'uR"', 'UR"', 'LR"', 'R"'] as const;
  const prefix = prefixes.find((candidate) => source.startsWith(candidate, start));
  if (!prefix) return undefined;
  const delimiterStart = start + prefix.length;
  const openingParen = source.indexOf('(', delimiterStart);
  if (openingParen === -1 || openingParen - delimiterStart > 16) return source.length;
  const delimiter = source.slice(delimiterStart, openingParen);
  if (/[\s()\\]/.test(delimiter)) return source.length;
  const terminator = `)${delimiter}"`;
  const close = source.indexOf(terminator, openingParen + 1);
  return close === -1 ? source.length : close + terminator.length;
}

function logicalLineEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const newline = source.indexOf('\n', index);
    if (newline === -1) return source.length;
    let beforeNewline = newline - 1;
    if (beforeNewline >= start && source[beforeNewline] === '\r') beforeNewline -= 1;
    if (beforeNewline < start || source[beforeNewline] !== '\\') return newline + 1;
    index = newline + 1;
  }
  return source.length;
}

function isAtLogicalLineStart(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  return /^[\t\v\f ]*$/.test(source.slice(lineStart, index));
}

export function tokenizeCpp(source: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (source.startsWith('//', index)) {
      index = logicalLineEnd(source, index + 2);
      continue;
    }
    if (source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      index = close === -1 ? source.length : close + 2;
      continue;
    }
    if (character === '#' && isAtLogicalLineStart(source, index)) {
      index = logicalLineEnd(source, index + 1);
      continue;
    }
    const rawStringEnd = rawStringLiteralEnd(source, index);
    if (rawStringEnd !== undefined) {
      tokens.push({ value: source.slice(index, rawStringEnd), start: index, end: rawStringEnd });
      index = rawStringEnd;
      continue;
    }
    if (/[0-9]/.test(character) || (character === '.' && /[0-9]/.test(source[index + 1] ?? ''))) {
      const start = index++;
      while (index < source.length) {
        const next = source[index];
        if (
          /[A-Za-z0-9_.]/.test(next) ||
          (next === "'" && /[A-Za-z0-9]/.test(source[index + 1] ?? '')) ||
          ((next === '+' || next === '-') && /[eEpP]/.test(source[index - 1]))
        ) {
          index++;
        } else break;
      }
      tokens.push({ value: source.slice(start, index), start, end: index });
      continue;
    }
    if (character === '"' || character === "'") {
      const end = quotedLiteralEnd(source, index, character);
      tokens.push({ value: source.slice(index, end), start: index, end });
      index = end;
      continue;
    }
    if (isIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierPart(source[index])) index += 1;
      tokens.push({ value: source.slice(start, index), start, end: index });
      continue;
    }
    tokens.push({ value: character, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
}

function testKey(value: string): string {
  let a = 2166136261;
  let b = 3339675911;
  for (const byte of new TextEncoder().encode(value)) {
    a = Math.imul(a ^ byte, 16777619) >>> 0;
    b = Math.imul(b ^ byte, 16777619) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

function literalName(tokens: readonly SourceToken[]): string | undefined {
  let result = '';
  for (const token of tokens) {
    const raw = /^(?:u8|u|U|L)?R"([^ ()\\\t\r\n]{0,16})\(([\s\S]*)\)\1"$/.exec(token.value);
    if (raw) {
      result += raw[2];
      continue;
    }
    if (!/^"[\s\S]*"$/.test(token.value)) return undefined;
    try {
      result += JSON.parse(token.value) as string;
    } catch {
      return undefined;
    }
  }
  return result || undefined;
}

type Declaration = {
  edits: { start: number; end: number; text: string }[];
};

function declarations(path: string, source: string): Declaration[] {
  const tokens = tokenizeCpp(source);
  const ordinals = new Map<number, number>();
  const found: Declaration[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const macro = tokens[i];
    if (!['STUDENT_TEST', 'PROVIDED_TEST'].includes(macro.value) || tokens[i + 1]?.value !== '(') continue;
    let depth = 1;
    let end = i + 2;
    for (; end < tokens.length; end++) {
      if (tokens[end].value === '(') depth++;
      if (tokens[end].value === ')' && --depth === 0) break;
    }
    if (end >= tokens.length) continue;
    const line = source.slice(0, macro.start).split('\n').length;
    const ordinal = ordinals.get(line) ?? 0;
    ordinals.set(line, ordinal + 1);
    const origin = macro.value === 'STUDENT_TEST' ? 'student' : 'provided';
    const name = literalName(tokens.slice(i + 2, end)) ?? `Test at ${path.split('/').pop()}:${line}`;
    const key = testKey(`${path}\n${line}\n${ordinal}\n${origin}\n${name}`);
    found.push({
      edits: [
        { start: macro.start, end: macro.end, text: 'SIMPLETEST_KEY' },
        { start: tokens[i + 1].end, end: tokens[i + 1].end, text: `"${key}",` },
        { start: tokens[end].start, end: tokens[end].start, text: `,"${origin}"` },
      ],
    });
    i = end;
  }
  return found;
}

/** Rename `main` → `original_main(int argc, char** argv)` so the runner can call it. */
function hideUserMain(source: string): { source: string; hadMain: boolean } {
  const tokens = tokenizeCpp(source);
  const scopes: boolean[] = [];
  const mainTokens: { name: SourceToken; open: SourceToken; close: SourceToken }[] = [];
  tokens.forEach((token, index) => {
    if (token.value === '{') {
      scopes.push(
        tokens[index - 2]?.value === 'extern' && ['"C"', '"C++"'].includes(tokens[index - 1]?.value ?? ''),
      );
    } else if (token.value === '}') scopes.pop();
    else if (
      token.value === 'main' &&
      scopes.every((linkage) => linkage) &&
      ['int', 'void', 'auto', 'signed'].includes(tokens[index - 1]?.value ?? '') &&
      tokens[index + 1]?.value === '('
    ) {
      let depth = 1;
      let end = index + 2;
      for (; end < tokens.length; end++) {
        if (tokens[end].value === '(') depth++;
        if (tokens[end].value === ')' && --depth === 0) break;
      }
      if (end < tokens.length) {
        mainTokens.push({ name: token, open: tokens[index + 1], close: tokens[end] });
      }
    }
  });
  if (mainTokens.length === 0) return { source, hadMain: false };

  let renamed = source;
  for (const { name, open, close } of [...mainTokens].reverse()) {
    renamed =
      renamed.slice(0, name.start) +
      'original_main' +
      renamed.slice(name.end, open.end) +
      'int argc, char** argv' +
      renamed.slice(close.start);
  }
  // Keep line numbers identical to the editor; callers wrap with `#line 1 "/…"`.
  return { source: renamed, hadMain: true };
}

function makeConfig(nonce: string, hasUserMain: boolean): string {
  return [
    `#define SIMPLETEST_NONCE "${nonce}"`,
    `#define SIMPLETEST_ALL true`,
    `#define SIMPLETEST_SELECTION std::vector<std::string>{}`,
    `#define DEBUGGER_HAS_USER_MAIN ${hasUserMain ? 1 : 0}`,
    '',
  ].join('\n');
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when the student source declares at least one SimpleTest block. */
export function sourceHasTests(source: string): boolean {
  return declarations('/main.c', source).length > 0;
}

/**
 * Prepare C/C++ sources for a Run. When tests are present, rewrites macros,
 * renames user main, and adds a runner that calls main then runs tests.
 * SimpleTest.h itself always comes from the Stanford support FS.
 */
export function prepareCppRun(studentSource: string, studentPath = 'main.c'): PreparedCppRun {
  const found = declarations('/' + studentPath, studentSource);
  if (found.length === 0) {
    return { files: { [studentPath]: studentSource }, extraSources: [], hasTests: false, nonce: '' };
  }

  const edits = found.flatMap((f) => f.edits).sort((a, b) => b.start - a.start);
  let transformed = studentSource;
  for (const edit of edits) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  const { source: renamed, hadMain } = hideUserMain(transformed);
  const nonce = randomNonce();
  // DAP sets breakpoints on the absolute virtual path (e.g. `/main.c`). The
  // engine matches DWARF paths with exact equality, so `#line` must use that
  // same absolute path — a relative `main.c` will never hit.
  const dapPath = studentPath.startsWith('/') ? studentPath : `/${studentPath}`;
  const preparedSource = [
    '#pragma clang diagnostic push',
    '#pragma clang diagnostic ignored "-Wreturn-type"',
    '#pragma clang diagnostic ignored "-Wunused-parameter"',
    `#line 1 "${dapPath}"`,
    renamed,
    '#pragma clang diagnostic pop',
  ].join('\n');

  return {
    hasTests: true,
    nonce,
    files: {
      [studentPath]: preparedSource,
      // Header is already in the Stanford FS; only the TUs + config are run-specific.
      'SimpleTest.cpp': SIMPLETEST_CPP,
      'SimpleTest_runner.cpp': SIMPLETEST_RUNNER,
      'SimpleTest_config.h': makeConfig(nonce, hadMain),
    },
    extraSources: ['/SimpleTest.cpp', '/SimpleTest_runner.cpp'],
  };
}
