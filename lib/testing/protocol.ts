/** Minimal stdout decoder for SimpleTest markers (`__SIMPLETEST_V1__:<nonce>:<json>`). */

export const TEST_REPORT_PREFIX = '__SIMPLETEST_V1__:';

export type TestOrigin = 'student' | 'provided' | 'external';

export type TestInfo = {
  key: string;
  name: string;
  origin: TestOrigin;
  group?: string;
  path?: string;
  line?: number;
};

export type TestResultStatus = 'passed' | 'failed' | 'errored' | 'running';

export type TestResult = {
  key: string;
  status: TestResultStatus;
  durationMs?: number;
  message?: string;
  actual?: { expression: string; value: string };
  expected?: { expression: string; value: string };
  path?: string;
  line?: number;
};

export type TestRunState = {
  tests: TestInfo[];
  results: Map<string, TestResult>;
  finished: boolean;
  terminated?: { reason: string; message?: string };
  durationMs?: number;
  error?: string;
};

type RawEvent = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pair(value: unknown): { expression: string; value: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  const expression = asString(o.expression);
  const text = asString(o.value);
  if (expression === undefined || text === undefined) return undefined;
  return { expression, value: text };
}

export function createEmptyTestRunState(): TestRunState {
  return { tests: [], results: new Map(), finished: false };
}

export function createTestReportDecoder(nonce: string) {
  const marker = `${TEST_REPORT_PREFIX}${nonce}:`;
  let buffer = '';
  /** Blank lines held until we know the next line isn't a protocol marker. */
  let pendingBlank = '';
  const state = createEmptyTestRunState();

  const apply = (event: RawEvent) => {
    const type = asString(event.type);
    if (!type) return;
    if (type === 'test_discovered') {
      const key = asString(event.key);
      const name = asString(event.name);
      const origin = asString(event.origin) as TestOrigin | undefined;
      if (!key || !name || !origin) return;
      state.tests.push({
        key,
        name,
        origin,
        group: asString(event.group),
        path: asString(event.path),
        line: asNumber(event.line),
      });
      return;
    }
    if (type === 'test_started') {
      const key = asString(event.key);
      if (!key) return;
      state.results.set(key, { key, status: 'running' });
      return;
    }
    if (type === 'test_passed' || type === 'test_failed' || type === 'test_errored') {
      const key = asString(event.key);
      if (!key) return;
      const status = type === 'test_passed' ? 'passed' : type === 'test_failed' ? 'failed' : 'errored';
      state.results.set(key, {
        key,
        status,
        durationMs: asNumber(event.durationMs),
        message: asString(event.message),
        actual: pair(event.actual),
        expected: pair(event.expected),
        path: asString(event.path),
        line: asNumber(event.line),
      });
      return;
    }
    if (type === 'run_finished') {
      state.finished = true;
      state.durationMs = asNumber(event.durationMs);
      return;
    }
    if (type === 'run_terminated') {
      state.finished = true;
      state.terminated = {
        reason: asString(event.reason) ?? 'unknown',
        message: asString(event.message),
      };
    }
  };

  return {
    state,
    /** Returns text that should still go to the terminal (markers stripped). */
    push(chunk: string): string {
      buffer += chunk;
      let output = '';
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const bare = line.replace(/\r$/, '');
        if (bare.startsWith(marker)) {
          // Drop blank lines that only separated protocol frames from real output.
          pendingBlank = '';
          try {
            apply(JSON.parse(bare.slice(marker.length)) as RawEvent);
          } catch {
            output += line + '\n';
          }
        } else if (bare === '') {
          pendingBlank += '\n';
        } else {
          output += pendingBlank + line + '\n';
          pendingBlank = '';
        }
      }
      return output;
    },
    finish(): string {
      // Drop trailing blank lines held for marker detection — they aren't program output.
      pendingBlank = '';
      if (!buffer) return '';
      const line = buffer;
      buffer = '';
      const bare = line.replace(/\r$/, '');
      if (bare.startsWith(marker)) {
        try {
          apply(JSON.parse(bare.slice(marker.length)) as RawEvent);
          return '';
        } catch {
          return line;
        }
      }
      return line;
    },
  };
}
