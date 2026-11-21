'use client';

import { Pipe, type Debugger, type Engine, type Frame, type Process, type Stop } from 'debugger-sh';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LANGS, type Lang } from '@/components/constants';
import type { DapVariable, ScopeView, StackFrame } from '@/components/dap-types';
import type { TerminalHandle } from '@/components/Terminal';
import { getEngine, warmCppToolchain } from '@/lib/engine';
import { toDebugFrame } from '@/lib/telemetry/map';
import { Telemetry } from '@/lib/telemetry/client';
import type { TestCase } from '@/lib/telemetry/types';
import { mountStanfordArtifacts, stanfordCppOptions } from '@/lib/stanford/loadArtifacts';
import { prepareCppRun } from '@/lib/testing/prepare';
import { createTestReport, type TestRunState } from '@/lib/testing/protocol';

/** SimpleTest runner frames, hidden from the call stack while debugging tests. */
function isSimpleTestHarnessFrame(frame: StackFrame): boolean {
  return /SimpleTest(?:_runner)?\.(?:cpp|c|h)$/i.test(frame.source?.path ?? '') || /simpletest::/i.test(frame.name);
}

/** Normalizes a debugger source path for comparison with `LANGS[lang].sourcePath`. */
function normalizeSourcePath(path: string | undefined): string {
  if (!path) return '';
  const p = path.replace(/^file:\/\//, '').replace(/\\/g, '/');
  return p.startsWith('/') ? p : `/${p}`;
}

/** Whether `frame` is in the file being edited (rather than a library or the test harness). */
function inMainSource(frame: StackFrame, lang: Lang): boolean {
  return normalizeSourcePath(frame.source?.path) === LANGS[lang].sourcePath;
}

type StopReason = 'breakpoint' | 'step' | 'exception' | 'pause';

function mapStopReason(reason: string): StopReason {
  if (reason === 'step' || reason === 'exception') return reason;
  return reason.includes('breakpoint') ? 'breakpoint' : 'pause';
}

/** A copy of the test state that React sees as new. */
function snapshot(state: TestRunState): TestRunState {
  return { ...state, results: new Map(state.results) };
}

function testsFrom(state: TestRunState): TestCase[] {
  const { tests, results } = state;
  const cases: TestCase[] = [];
  const seen = new Set<string>();
  const push = (name: string, key: string, fallbackLine?: number) => {
    const result = results.get(key);
    const row: TestCase = { name, passed: result?.status === 'passed' };
    if (result?.expected) row.expected = result.expected;
    if (result?.actual) row.actual = result.actual;
    const line = result?.line ?? fallbackLine;
    if (line !== undefined) row.line = line;
    if (result?.message) row.message = result.message;
    cases.push(row);
  };
  for (const info of tests) {
    seen.add(info.key);
    push(info.name, info.key, info.line);
  }
  for (const key of results.keys()) {
    if (!seen.has(key)) push(key, key);
  }
  return cases;
}

/**
 * Writes `code` into the engine and starts it. C++ programs are built against the
 * Stanford library; programs with SimpleTest cases report results on `tests`.
 * Toolchain `sources` are globs relative to the root, so they use the bare file name.
 */
async function start(
  engine: Engine,
  lang: Lang,
  code: string,
  debug: boolean
): Promise<{ proc: Process; tests?: Pipe }> {
  const { fsKey, sourcePath } = LANGS[lang];
  if (lang === 'python') {
    await engine.fs.writeFile(sourcePath, code);
    return { proc: engine.run('python', [sourcePath], { debug, stdin: true }) };
  }
  if (lang === 'rust') {
    await engine.fs.writeFile(sourcePath, code);
    return { proc: engine.run('rust', { sources: [fsKey], debug, stdin: true }) };
  }
  const prepared = prepareCppRun(code, sourcePath);
  await mountStanfordArtifacts(engine);
  await engine.fs.writeFile(sourcePath, prepared.source);
  const tests = prepared.hasTests ? new Pipe() : undefined;
  const proc = engine.run('cpp', {
    ...stanfordCppOptions,
    sources: [fsKey],
    debug,
    stdin: true,
    devices: tests ? { '/dev/simpletest': tests } : undefined,
  });
  return { proc, tests };
}

type ExecutionApi = {
  isRunning: boolean;
  isPaused: boolean;
  stoppedLine: number | null;
  /** Increments whenever the editor should scroll to `stoppedLine`. */
  revealSeq: number;
  /** True when this reveal is a debugger stop and the line should flash. */
  revealFlash: boolean;
  frames: StackFrame[];
  selectedFrameId: number | null;
  scopes: ScopeView[];
  debugLoading: boolean;
  testState: TestRunState | null;
  run: (
    code: string,
    breakpoints: ReadonlySet<number>,
    lang: Lang
  ) => Promise<void>;
  stop: () => void;
  resume: () => void;
  stepOver: () => void;
  stepIn: () => void;
  stepOut: () => void;
  selectFrame: (id: number) => void;
  /** Returns the children of a variable, or [] on failure. */
  expandVariable: (ref: number) => DapVariable[];
  /** Sends a new breakpoint set to the running program, if any. */
  applyBreakpoints: (breakpoints: ReadonlySet<number>) => void;
};

const ignore = () => undefined;

export function useExecution(terminalRef: React.RefObject<TerminalHandle | null>): ExecutionApi {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stoppedLine, setStoppedLine] = useState<number | null>(null);
  const [revealSeq, setRevealSeq] = useState(0);
  const [revealFlash, setRevealFlash] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [scopes, setScopes] = useState<ScopeView[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [testState, setTestState] = useState<TestRunState | null>(null);

  const procRef = useRef<Process | null>(null);
  const isRunningRef = useRef(false);
  const stdinDisposeRef = useRef<(() => void) | null>(null);
  const breakpointsRef = useRef<ReadonlySet<number>>(new Set());
  const langRef = useRef<Lang>('c');
  const testStateRafRef = useRef<number | null>(null);
  const stdoutBufferRef = useRef('');
  const stopReasonRef = useRef<StopReason>('pause');
  const autoSkipStopRef = useRef(false);
  /** Caps just-my-code skips in case the program never re-enters the main file. */
  const librarySkipRef = useRef(0);

  // Load the C++ toolchain and Stanford library as soon as the IDE mounts.
  useEffect(() => {
    void getEngine()
      .then((engine) => Promise.all([warmCppToolchain(), mountStanfordArtifacts(engine)]))
      .catch(ignore);
  }, []);

  const currentDebugger = () => procRef.current?.debugger;

  const sendBreakpoints = useCallback(async () => {
    const lines = Array.from(breakpointsRef.current).sort((a, b) => a - b);
    await currentDebugger()?.setBreakpoints(
      LANGS[langRef.current].sourcePath,
      lines.map((line) => ({ line }))
    );
  }, []);

  const loadFrame = useCallback((frame: Frame): ScopeView[] => {
    let views: ScopeView[] = [];
    try {
      views = frame.scopes().map((scope) => ({ name: scope.name, variables: scope.vars() }));
    } catch {
      // The process exited while we were looking.
    }
    setScopes(views);
    return views;
  }, []);

  /** Clears the paused location, e.g. when the program resumes. */
  const clearStop = useCallback(() => {
    setIsPaused(false);
    setStoppedLine(null);
    setFrames([]);
    setSelectedFrameId(null);
    setScopes([]);
  }, []);

  const clearDebug = useCallback(() => {
    clearStop();
    setDebugLoading(false);
  }, [clearStop]);

  const showStop = useCallback(
    (dbg: Debugger, stop: Stop) => {
      if (currentDebugger() !== dbg) return;
      if (!autoSkipStopRef.current) stopReasonRef.current = mapStopReason(stop.reason);
      autoSkipStopRef.current = false;
      setIsPaused(true);
      setDebugLoading(true);
      try {
        const raw = stop.frames();

        // Just my code: never show a stop outside the main file (Stanford headers, libc++,
        // the test harness). Step over rather than out: Step Into on
        // `EXPECT_EQUAL(f(v[i]), …)` lands in `Vector::operator[]` first, and stepping out
        // of it would skip the rest of the statement, including the call to `f`.
        if (raw.length > 0 && !inMainSource(raw[0], langRef.current)) {
          // Keep the original stop reason across the automatic skip.
          autoSkipStopRef.current = true;
          if (librarySkipRef.current++ >= 64) {
            librarySkipRef.current = 0;
            dbg.continue().catch(ignore);
          } else {
            dbg.stepOver().catch(ignore);
          }
          clearStop();
          return;
        }
        librarySkipRef.current = 0;

        // Hide SimpleTest runner / harness frames when stopped inside a test.
        const fs = raw.filter((frame) => !isSimpleTestHarnessFrame(frame));
        setFrames(fs);
        if (fs.length === 0) {
          setSelectedFrameId(null);
          setStoppedLine(null);
          setScopes([]);
          return;
        }
        setSelectedFrameId(fs[0].id);
        const topLine = fs[0].line > 0 ? fs[0].line : null;
        setStoppedLine(topLine);
        if (topLine != null) {
          setRevealFlash(true);
          setRevealSeq((n) => n + 1);
        }
        const views = loadFrame(fs[0]);
        Telemetry.log('debug_stop', {
          reason: stopReasonRef.current,
          ...(topLine != null ? { line: topLine } : {}),
          frame_count: fs.length,
          top_frame: toDebugFrame(0, fs[0].name, views),
        });
      } catch {
        // The process exited while we were looking.
      } finally {
        setDebugLoading(false);
      }
    },
    [clearStop, loadFrame]
  );

  const teardown = useCallback(() => {
    stdinDisposeRef.current?.();
    stdinDisposeRef.current = null;
    procRef.current = null;
    isRunningRef.current = false;
  }, []);

  const wireStdout = useCallback(
    (proc: Process) => {
      const write = (kind: 'stdout' | 'stderr') => (text: string) => {
        if (procRef.current !== proc) return;
        Telemetry.log('run_io', { kind, data: text });
        const output = text.replace(/\r?\n/g, '\r\n');
        // Keep a copy to redraw the terminal with when the run ends.
        stdoutBufferRef.current += output;
        terminalRef.current?.write(output);
      };
      proc.stdout.on('text', write('stdout'));
      proc.stderr.on('text', write('stderr'));
    },
    [terminalRef]
  );

  const wireStdin = useCallback(
    (proc: Process) => {
      const term = terminalRef.current;
      if (!term) return;
      const send = (text: string) => {
        if (!proc.stdin.closed) proc.stdin.write(text).catch(ignore);
      };
      let buffer = '';
      stdinDisposeRef.current = term.onData((data) => {
        if (!isRunningRef.current) return;
        Telemetry.log('run_io', { kind: 'stdin', data });
        if (data === '\x03') {
          term.write('^C\r\n');
          proc.kill();
          return;
        }
        if (data === '\x04') {
          term.write('^D\r\n');
          proc.stdin.close();
          buffer = '';
          return;
        }
        if (data === '\x0c') {
          term.clear();
          buffer = '';
          return;
        }
        if (data === '\r') {
          term.write('\r\n');
          send(`${buffer}\n`);
          buffer = '';
          return;
        }
        if (data === '\u007f') {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            term.write('\b \b');
          }
          return;
        }
        if (data.startsWith('\x1b')) return;
        buffer += data;
        term.write(data);
      });
    },
    [terminalRef]
  );

  /** Feeds SimpleTest events into `report`, refreshing the Tests panel once per frame. */
  const readTests = useCallback(
    async (proc: Process, pipe: Pipe, report: ReturnType<typeof createTestReport>) => {
      for await (const line of pipe.lines()) {
        report.push(line);
        testStateRafRef.current ??= requestAnimationFrame(() => {
          testStateRafRef.current = null;
          if (procRef.current === proc) setTestState(snapshot(report.state));
        });
      }
    },
    []
  );

  const run = useCallback(
    async (code: string, breakpoints: ReadonlySet<number>, lang: Lang) => {
      if (isRunningRef.current) return;
      Telemetry.log('run_start');
      let finish: { reason: 'completed' | 'error' | 'stopped'; exit_code?: number } = {
        reason: 'error',
      };
      const started = performance.now();
      langRef.current = lang;
      breakpointsRef.current = breakpoints;
      teardown();
      clearDebug();
      setTestState(null);
      stdoutBufferRef.current = '';
      setIsRunning(true);
      isRunningRef.current = true;
      terminalRef.current?.clear();
      terminalRef.current?.focus();
      let report: ReturnType<typeof createTestReport> | null = null;

      try {
        if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
          terminalRef.current?.writeln(
            '\r\n[ide warning] SharedArrayBuffer is unavailable (crossOriginIsolated=false). ' +
              'Run via `npm run dev` — not a static export preview.'
          );
        }

        // Only debug when there is somewhere to stop.
        const { proc, tests } = await start(await getEngine(), lang, code, breakpoints.size > 0);
        procRef.current = proc;
        wireStdout(proc);
        wireStdin(proc);

        let reading: Promise<void> | undefined;
        if (tests) {
          report = createTestReport();
          reading = readTests(proc, tests, report);
        }

        const dbg = proc.debugger;
        if (dbg) {
          dbg.on('stop', (stop) => showStop(dbg, stop));
          // Waits for the program to be built and loaded, then starts it.
          void sendBreakpoints()
            .then(() => dbg.continue())
            .catch(ignore);
        }

        const result = await proc;
        await reading;
        finish = result.killed
          ? { reason: 'stopped' }
          : { reason: 'completed', exit_code: result.exitCode };
        if (report) {
          const nextState = snapshot(report.state);
          const failuresExplainExit = [...nextState.results.values()].some(
            (r) => r.status === 'failed' || r.status === 'errored' || r.status === 'leaked',
          );
          if (!result.killed && result.exitCode !== 0 && !failuresExplainExit) {
            nextState.finished = true;
            nextState.error = "Couldn't run tests. Please see the Terminal for more info";
          }
          setTestState(nextState);
        }
      } catch (err) {
        stdoutBufferRef.current += `\r\n[ide error] ${err instanceof Error ? err.message : String(err)}\r\n`;
        if (report) {
          setTestState({
            ...snapshot(report.state),
            finished: true,
            error: "Couldn't run tests. Please see the Terminal for more info",
          });
        }
      } finally {
        const tests = report ? testsFrom(report.state) : [];
        Telemetry.log('run_stop', {
          ...finish,
          ...(tests.length ? { tests } : {}),
        });
        const ms = Math.round(performance.now() - started);
        const term = terminalRef.current;
        if (term) {
          term.clear();
          if (stdoutBufferRef.current) term.write(stdoutBufferRef.current);
          term.writeln(`\r\n\x1b[3;90mRan in ${ms}ms\x1b[0m`);
        }
        teardown();
        clearDebug();
        setIsRunning(false);
      }
    },
    [
      clearDebug,
      readTests,
      sendBreakpoints,
      showStop,
      teardown,
      terminalRef,
      wireStdin,
      wireStdout,
    ]
  );

  const stop = useCallback(() => {
    procRef.current?.kill();
    teardown();
    clearDebug();
    setIsRunning(false);
  }, [clearDebug, teardown]);

  const resume = useCallback(() => {
    if (!isRunningRef.current) return;
    Telemetry.log('debug_step', { kind: 'continue' });
    currentDebugger()?.continue().catch(ignore);
    clearStop();
  }, [clearStop]);

  const step = useCallback((kind: 'over' | 'in' | 'out') => {
    if (!isRunningRef.current) return;
    Telemetry.log('debug_step', { kind });
    setDebugLoading(true);
    setScopes([]);
    setFrames([]);
    const dbg = currentDebugger();
    const next = kind === 'over' ? dbg?.stepOver() : kind === 'in' ? dbg?.stepIn() : dbg?.stepOut();
    next?.catch(ignore);
  }, []);

  const selectFrame = useCallback(
    (id: number) => {
      setSelectedFrameId(id);
      const index = frames.findIndex((frame) => frame.id === id);
      const frame = frames[index];
      if (!frame) return;
      const views = loadFrame(frame);
      Telemetry.log('debug_frame', { frame: toDebugFrame(index, frame.name, views) });
      if (frame.line >= 1 && inMainSource(frame, langRef.current)) {
        setStoppedLine(frame.line);
        setRevealFlash(false);
        setRevealSeq((n) => n + 1);
      } else {
        setStoppedLine(null);
      }
    },
    [frames, loadFrame]
  );

  const expandVariable = useCallback((ref: number): DapVariable[] => {
    const dbg = currentDebugger();
    if (ref <= 0 || !dbg) return [];
    try {
      const res = dbg.dap.send({
        type: 'request',
        seq: 0,
        command: 'variables',
        arguments: { variablesReference: ref },
      });
      return res.success ? ((res.body as { variables?: DapVariable[] })?.variables ?? []) : [];
    } catch {
      return [];
    }
  }, []);

  const applyBreakpoints = useCallback(
    (breakpoints: ReadonlySet<number>) => {
      breakpointsRef.current = breakpoints;
      sendBreakpoints().catch(ignore);
    },
    [sendBreakpoints]
  );

  return {
    isRunning,
    isPaused,
    stoppedLine,
    revealSeq,
    revealFlash,
    frames,
    selectedFrameId,
    scopes,
    debugLoading,
    testState,
    run,
    stop,
    resume,
    stepOver: () => step('over'),
    stepIn: () => step('in'),
    stepOut: () => step('out'),
    selectFrame,
    expandVariable,
    applyBreakpoints,
  };
}
