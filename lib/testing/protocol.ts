/** Decoder for SimpleTest events: one JSON object per line, read from the `/dev/simpletest` pipe. */

export type TestOrigin = 'student' | 'provided' | 'external';

export type TestInfo = {
  key: string;
  name: string;
  origin: TestOrigin;
  group?: string;
  path?: string;
  line?: number;
};

export type TestResultStatus = 'passed' | 'failed' | 'errored' | 'leaked' | 'running';

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

export function createTestReport() {
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
    const outcome: Record<string, TestResultStatus> = {
      test_passed: 'passed',
      test_failed: 'failed',
      test_errored: 'errored',
      test_leaked: 'leaked',
    };
    if (type in outcome) {
      const key = asString(event.key);
      if (!key) return;
      state.results.set(key, {
        key,
        status: outcome[type],
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
    /** Applies one line of the event stream. Malformed lines are ignored. */
    push(line: string) {
      try {
        apply(JSON.parse(line) as RawEvent);
      } catch {
        /* not an event */
      }
    },
  };
}
