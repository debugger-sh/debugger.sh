'use client';

import { Engine } from 'debugger-sh';
import { useCallback, useRef, useState } from 'react';

import { LANGS, type Lang } from '@/components/constants';
import type {
  DapResponse,
  DapVariable,
  Scope,
  ScopeView,
  StackFrame,
} from '@/components/dap-types';
import type { TerminalHandle } from '@/components/Terminal';

export type UseExecutionOptions = {
  terminalRef: React.RefObject<TerminalHandle | null>;
};

export type ExecutionApi = {
  isRunning: boolean;
  isPaused: boolean;
  stoppedLine: number | null;
  frames: StackFrame[];
  selectedFrameId: number | null;
  scopes: ScopeView[];
  debugLoading: boolean;
  run: (code: string, breakpoints: ReadonlySet<number>, lang: Lang) => Promise<void>;
  stop: () => void;
  resume: () => void;
  stepOver: () => void;
  stepIn: () => void;
  stepOut: () => void;
  selectFrame: (id: number) => void;
  /** Sync DAP `variables` request — returns child variables or [] on failure. */
  expandVariable: (ref: number) => DapVariable[];
  /** Push a new breakpoint set to the running runtime (no-op if not running). */
  applyBreakpoints: (breakpoints: ReadonlySet<number>) => void;
};

export function useExecution({ terminalRef }: UseExecutionOptions): ExecutionApi {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stoppedLine, setStoppedLine] = useState<number | null>(null);
  const [frames, setFrames] = useState<StackFrame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [scopes, setScopes] = useState<ScopeView[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);

  const runtimeRef = useRef<Engine | null>(null);
  const isRunningRef = useRef(false);
  const dapSeqRef = useRef(1);
  const ioCleanupRef = useRef<(() => void) | null>(null);
  const stdinDisposeRef = useRef<(() => void) | null>(null);
  const breakpointsRef = useRef<ReadonlySet<number>>(new Set());
  const langRef = useRef<Lang>('c');

  const dapSend = useCallback(<T,>(command: string, args: Record<string, unknown>) => {
    const rt = runtimeRef.current;
    if (!rt) return null;
    const res = rt.debugger.send({
      type: 'request',
      seq: dapSeqRef.current++,
      command,
      arguments: args,
    });
    return res as DapResponse<T> | null;
  }, []);

  const sendBreakpoints = useCallback(() => {
    if (breakpointsRef.current.size === 0) return;
    const lines = Array.from(breakpointsRef.current).sort((a, b) => a - b);
    dapSend('setBreakpoints', {
      source: { path: LANGS[langRef.current].sourcePath },
      breakpoints: lines.map((line) => ({ line })),
    });
  }, [dapSend]);

  /** Steps 5–8 in the engine DAP lifecycle; returns true once the worker is unblocked. */
  const completeDapHandshake = useCallback((): boolean => {
    sendBreakpoints();
    dapSend('setExceptionBreakpoints', { filters: [] });
    const res = dapSend('configurationDone', {}) as DapResponse<unknown> | null;
    return res?.success === true;
  }, [dapSend, sendBreakpoints]);

  const loadFrame = useCallback(
    (frameId: number) => {
      const scopeRes = dapSend<{ scopes: Scope[] }>('scopes', { frameId });
      const list = scopeRes?.body?.scopes ?? [];
      const views: ScopeView[] = list.map((sc) => {
        const v = dapSend<{ variables: DapVariable[] }>('variables', {
          variablesReference: sc.variablesReference,
        });
        return { name: sc.name, variables: v?.body?.variables ?? [] };
      });
      setScopes(views);
    },
    [dapSend],
  );

  const refreshDebugSession = useCallback(() => {
    setDebugLoading(true);
    try {
      const res = dapSend<{ stackFrames: StackFrame[] }>('stackTrace', { threadId: 1 });
      if (!res?.success) return;
      const fs = res.body?.stackFrames ?? [];
      setFrames(fs);
      if (fs.length === 0) {
        setSelectedFrameId(null);
        setStoppedLine(null);
        setScopes([]);
        return;
      }
      setStoppedLine(fs[0].line);
      setSelectedFrameId(fs[0].id);
      loadFrame(fs[0].id);
    } finally {
      setDebugLoading(false);
    }
  }, [dapSend, loadFrame]);

  const scheduleDebugRefresh = useCallback(() => {
    const run = () => refreshDebugSession();
    window.setTimeout(run, 0);
    window.setTimeout(run, 50);
  }, [refreshDebugSession]);

  const clearDebug = useCallback(() => {
    setIsPaused(false);
    setStoppedLine(null);
    setFrames([]);
    setSelectedFrameId(null);
    setScopes([]);
    setDebugLoading(false);
  }, []);

  const teardown = useCallback(() => {
    ioCleanupRef.current?.();
    ioCleanupRef.current = null;
    stdinDisposeRef.current?.();
    stdinDisposeRef.current = null;
    runtimeRef.current = null;
    isRunningRef.current = false;
  }, []);

  const wireStdout = useCallback(
    (rt: Engine) => {
      const term = terminalRef.current;
      if (!term) return;
      const decoder = new TextDecoder();
      const onData = (chunk: Uint8Array) => {
        term.write(decoder.decode(chunk).replace(/\r?\n/g, '\r\n'));
      };
      rt.stdout.on('data', onData);
      rt.stderr.on('data', onData);
      ioCleanupRef.current = () => {
        rt.stdout.off('data', onData);
        rt.stderr.off('data', onData);
      };
    },
    [terminalRef],
  );

  const wireStdin = useCallback(
    (rt: Engine) => {
      const term = terminalRef.current;
      if (!term) return;
      const encoder = new TextEncoder();
      let buffer = '';
      stdinDisposeRef.current = term.onData((data) => {
        if (!isRunningRef.current) return;
        if (data === '\x03') {
          term.write('^C\r\n');
          rt.stop();
          return;
        }
        if (data === '\x04') {
          term.write('^D\r\n');
          void rt.stdin.write(encoder.encode('\x04'));
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
          void rt.stdin.write(encoder.encode(`${buffer}\n`));
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
    [terminalRef],
  );

  const run = useCallback(
    async (code: string, breakpoints: ReadonlySet<number>, lang: Lang) => {
      if (isRunningRef.current) return;
      langRef.current = lang;
      const { fsKey } = LANGS[lang];
      const debug = breakpoints.size > 0;
      breakpointsRef.current = breakpoints;
      teardown();
      clearDebug();
      setIsRunning(true);
      isRunningRef.current = true;
      terminalRef.current?.clear();
      terminalRef.current?.focus();

      try {
        if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
          terminalRef.current?.writeln(
            '\r\n[ide warning] SharedArrayBuffer is unavailable (crossOriginIsolated=false). ' +
              'Run via `npm run dev` — not a static export preview.',
          );
        }

        const rt = await Engine.create(lang);
        runtimeRef.current = rt;
        if (lang === 'python') rt.debugger.filterInternals = true;
        dapSeqRef.current = 1;

        wireStdout(rt);
        wireStdin(rt);
        rt.fs = { [fsKey]: code };
        rt.debugger.enabled = debug;

        const handshakeDoneRef = { current: false };
        const tryDapHandshake = () => {
          if (handshakeDoneRef.current) return true;
          if (completeDapHandshake()) {
            handshakeDoneRef.current = true;
            return true;
          }
          return false;
        };

        if (debug) {
          rt.debugger.on('event', (msg: unknown) => {
            const m = msg as { type?: string; event?: string };
            if (m?.type !== 'event') return;
            if (m.event === 'initialized') {
              tryDapHandshake();
            } else if (m.event === 'stopped') {
              setIsPaused(true);
              scheduleDebugRefresh();
            } else if (m.event === 'terminated') {
              clearDebug();
            }
          });
        }

        // Match tools/dap/tests/lang/adapters/c-cpp/engine.ts: start run() before
        // initialize, then complete the handshake once the worker attaches.
        const runPromise = rt.run();
        if (debug) {
          dapSend('initialize', {});
          const handshakeDeadline = Date.now() + 120_000;
          while (!handshakeDoneRef.current) {
            if (tryDapHandshake()) break;
            if (Date.now() >= handshakeDeadline) {
              throw new Error(
                'DAP handshake timed out after 120s — worker may be blocked or still ' +
                  'fetching toolchain WASM. Rebuild the engine with `npm run build` (not tools/dev).',
              );
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        const result = await runPromise;
        if (result.type === 'error') {
          terminalRef.current?.writeln(
            `\r\n[ide error] ${result.error.type}: ${result.error.message}`,
          );
        }
      } catch (err) {
        terminalRef.current?.writeln(
          `\r\n[ide error] ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        teardown();
        setIsRunning(false);
      }
    },
    [
      clearDebug,
      completeDapHandshake,
      dapSend,
      scheduleDebugRefresh,
      teardown,
      terminalRef,
      wireStdin,
      wireStdout,
    ],
  );

  const stop = useCallback(() => {
    runtimeRef.current?.stop();
  }, []);

  const resume = useCallback(() => {
    if (!isRunningRef.current) return;
    dapSend('continue', { threadId: 1 });
    setIsPaused(false);
    setStoppedLine(null);
    setFrames([]);
    setSelectedFrameId(null);
    setScopes([]);
  }, [dapSend]);

  const step = useCallback(
    (command: 'next' | 'stepIn' | 'stepOut') => {
      if (!isRunningRef.current) return;
      setDebugLoading(true);
      setScopes([]);
      setFrames([]);
      dapSend(command, { threadId: 1 });
    },
    [dapSend],
  );

  const selectFrame = useCallback(
    (id: number) => {
      setSelectedFrameId(id);
      loadFrame(id);
    },
    [loadFrame],
  );

  const expandVariable = useCallback(
    (ref: number): DapVariable[] => {
      if (ref <= 0) return [];
      const res = dapSend<{ variables: DapVariable[] }>('variables', {
        variablesReference: ref,
      });
      return res?.body?.variables ?? [];
    },
    [dapSend],
  );

  const applyBreakpoints = useCallback(
    (breakpoints: ReadonlySet<number>) => {
      breakpointsRef.current = breakpoints;
      if (runtimeRef.current && breakpoints.size > 0) sendBreakpoints();
    },
    [sendBreakpoints],
  );

  return {
    isRunning,
    isPaused,
    stoppedLine,
    frames,
    selectedFrameId,
    scopes,
    debugLoading,
    run,
    stop,
    resume,
    stepOver: () => step('next'),
    stepIn: () => step('stepIn'),
    stepOut: () => step('stepOut'),
    selectFrame,
    expandVariable,
    applyBreakpoints,
  };
}
