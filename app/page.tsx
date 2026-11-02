'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import CodeEditor from '@/components/CodeEditor';
import { LANGS, type Lang } from '@/components/constants';
import { LanguageSelect } from '@/components/LanguageSelect';
import ResizableWorkspace from '@/components/ResizableWorkspace';
import { ShareButton } from '@/components/ShareButton';
import { RunStopButton } from '@/components/SourceActions';
import Terminal, { type TerminalHandle } from '@/components/Terminal';
import { TestsPanel } from '@/components/TestsPanel';
import { VariablesPanel } from '@/components/VariablesPanel';
import {
  adoptDockIds,
  defaultDockState,
  type DockState,
} from '@/components/dock/types';
import { useExecution } from '@/hooks/useExecution';
import { getShare } from '@/lib/share/api';
import type { WorkspaceState } from '@/lib/share/types';
import { installTelemetry, Telemetry } from '@/lib/telemetry/client';

function initialSources(): Record<Lang, string> {
  return Object.fromEntries(
    Object.entries(LANGS).map(([lang, cfg]) => [lang, cfg.defaultCode]),
  ) as Record<Lang, string>;
}

function initialBreakpoints(): Record<Lang, Set<number>> {
  return Object.fromEntries(
    Object.keys(LANGS).map((lang) => [lang, new Set<number>()]),
  ) as Record<Lang, Set<number>>;
}

export default function Page() {
  const [lang, setLang] = useState<Lang>('c');
  const [sources, setSources] = useState<Record<Lang, string>>(initialSources);
  const [breakpointsByLang, setBreakpointsByLang] =
    useState<Record<Lang, Set<number>>>(initialBreakpoints);
  const [layout, setLayout] = useState<DockState>(defaultDockState);
  const [dockKey, setDockKey] = useState(0);
  const [shareReady, setShareReady] = useState(false);
  const terminalRef = useRef<TerminalHandle | null>(null);
  // Stable element identity so the xterm instance is not remounted on each IDE render.
  const terminal = useMemo(() => <Terminal ref={terminalRef} />, []);
  const exec = useExecution({ terminalRef });

  const code = sources[lang];
  const breakpoints = breakpointsByLang[lang];
  const breakpointsRef = useRef(breakpoints);
  breakpointsRef.current = breakpoints;

  const setCode = useCallback(
    (next: string) => setSources((prev) => ({ ...prev, [lang]: next })),
    [lang],
  );

  const changeLanguage = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      Telemetry.log('edit', {
        offset: 0,
        deleted: sources[lang].length,
        inserted: sources[next],
        reason: 'language',
        language: next,
      });
      setLang(next);
    },
    [lang, sources],
  );

  const toggleBreakpoint = useCallback(
    (line: number) => {
      if (!LANGS[lang].debug) return;
      const current = breakpointsRef.current;
      const added = !current.has(line);
      const next = new Set(current);
      if (added) next.add(line);
      else next.delete(line);
      breakpointsRef.current = next;
      Telemetry.log('debug_breakpoint', { line, added });
      setBreakpointsByLang((prev) => ({ ...prev, [lang]: next }));
      exec.applyBreakpoints(next);
    },
    [exec, lang],
  );

  const onLayoutChange = useCallback((next: DockState) => {
    setLayout(next);
    Telemetry.log('layout_changed', { layout: next });
  }, []);

  const getShareState = useCallback(
    (): WorkspaceState => ({ lang, code, layout }),
    [lang, code, layout],
  );

  useLayoutEffect(() => installTelemetry(), []);

  useLayoutEffect(() => {
    if (!shareReady) return;
    const shareId = window.location.pathname.replace(/^\/+|\/+$/g, '');
    Telemetry.startSession({
      language: lang,
      code,
      layout,
      shareId: shareId || undefined,
    });
    // Session start reads the workspace as it became usable. Later edits are logged separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareReady]);

  useEffect(() => {
    const shareId = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!shareId) {
      setShareReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const state = await getShare(shareId);
        if (cancelled || !state) return;
        setLang(state.lang);
        setSources((prev) => ({ ...prev, [state.lang]: state.code }));
        if (state.layout) {
          adoptDockIds(state.layout);
          setLayout(state.layout);
          setDockKey((k) => k + 1);
        }
      } catch (err) {
        console.error('failed to load share', err);
      } finally {
        if (!cancelled) setShareReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="ide-page"
      data-loading={shareReady ? undefined : 'true'}
      style={{
        height: '100vh',
        padding: 16,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
      }}
    >
      <div className="ide-topbar">
        <Logo />
        <div className="ide-main-dock">
          <RunStopButton
            isRunning={exec.isRunning}
            onRun={() => void exec.run(code, breakpoints, lang)}
            onStop={exec.stop}
          />
          <LanguageSelect value={lang} onChange={changeLanguage} disabled={exec.isRunning} />
          <ShareButton getState={getShareState} />
        </div>
      </div>
      <ResizableWorkspace
        key={dockKey}
        layout={layout}
        onLayoutChange={onLayoutChange}
        panes={{
          editor: shareReady ? (
            <CodeEditor
              lang={lang}
              value={code}
              onChange={setCode}
              breakpoints={breakpoints}
              onToggleBreakpoint={toggleBreakpoint}
              stoppedLine={exec.stoppedLine}
            />
          ) : (
            <div />
          ),
          variables: (
            <VariablesPanel
              frames={exec.frames}
              selectedFrameId={exec.selectedFrameId}
              onSelectFrame={exec.selectFrame}
              scopes={exec.scopes}
              expandVariable={exec.expandVariable}
              isPaused={exec.isPaused}
              debugControls={{
                onContinue: exec.resume,
                onStepOver: exec.stepOver,
                onStepIn: exec.stepIn,
                onStepOut: exec.stepOut,
              }}
            />
          ),
          output: terminal,
          tests: <TestsPanel state={exec.testState} isRunning={exec.isRunning} />,
        }}
      />
      {!shareReady && (
        <div className="ide-boot-overlay" aria-busy="true" aria-label="Loading share">
          <div className="ide-boot-spinner" />
        </div>
      )}
    </main>
  );
}

const Logo = () => (
  <a href="https://github.com/debugger-sh/debugger.sh" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6b7280', letterSpacing: '0.02em', userSelect: 'none', textDecoration: 'none' }}>
    debugger<span style={{ color: '#ef4444' }}>.</span>sh
  </a>
);
