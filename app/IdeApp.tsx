'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

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
import type { WorkspaceState } from '@/lib/share/types';

function initialSources(seed?: WorkspaceState | null): Record<Lang, string> {
  const sources = Object.fromEntries(
    Object.entries(LANGS).map(([lang, cfg]) => [lang, cfg.defaultCode]),
  ) as Record<Lang, string>;
  if (seed) sources[seed.lang] = seed.code;
  return sources;
}

function initialBreakpoints(): Record<Lang, Set<number>> {
  return Object.fromEntries(
    Object.keys(LANGS).map((lang) => [lang, new Set<number>()]),
  ) as Record<Lang, Set<number>>;
}

function initialLayout(seed?: WorkspaceState | null): DockState {
  if (seed?.layout) {
    adoptDockIds(seed.layout);
    return seed.layout;
  }
  return defaultDockState();
}

export type IdeAppProps = {
  /** Share snapshot fetched on the server (if any). */
  initial?: WorkspaceState | null;
};

export default function IdeApp({ initial = null }: IdeAppProps) {
  const [lang, setLang] = useState<Lang>(() => initial?.lang ?? 'c');
  const [sources, setSources] = useState(() => initialSources(initial));
  const [breakpointsByLang, setBreakpointsByLang] =
    useState<Record<Lang, Set<number>>>(initialBreakpoints);
  const [layout, setLayout] = useState<DockState>(() => initialLayout(initial));
  const terminalRef = useRef<TerminalHandle | null>(null);
  // Stable element identity so the xterm instance is not remounted on each IDE render.
  const terminal = useMemo(() => <Terminal ref={terminalRef} />, []);
  const exec = useExecution({ terminalRef });

  const code = sources[lang];
  const breakpoints = breakpointsByLang[lang];

  const setCode = useCallback(
    (next: string) => setSources((prev) => ({ ...prev, [lang]: next })),
    [lang],
  );

  const toggleBreakpoint = useCallback(
    (line: number) => {
      if (!LANGS[lang].debug) return;
      setBreakpointsByLang((prev) => {
        const current = prev[lang];
        const next = new Set(current);
        if (next.has(line)) next.delete(line);
        else next.add(line);
        exec.applyBreakpoints(next);
        return { ...prev, [lang]: next };
      });
    },
    [exec, lang],
  );

  const getShareState = useCallback(
    (): WorkspaceState => ({ lang, code, layout }),
    [lang, code, layout],
  );

  return (
    <main
      className="ide-page"
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
          <LanguageSelect value={lang} onChange={setLang} disabled={exec.isRunning} />
          <ShareButton getState={getShareState} />
        </div>
      </div>
      <ResizableWorkspace
        layout={layout}
        onLayoutChange={setLayout}
        panes={{
          editor: (
            <CodeEditor
              lang={lang}
              value={code}
              onChange={setCode}
              breakpoints={breakpoints}
              onToggleBreakpoint={toggleBreakpoint}
              stoppedLine={exec.stoppedLine}
            />
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
    </main>
  );
}

const Logo = () => (
  <a
    href="https://github.com/debugger-sh/debugger.sh"
    target="_blank"
    rel="noreferrer"
    style={{
      padding: '0 4px',
      fontSize: 12,
      color: '#6b7280',
      letterSpacing: '0.02em',
      userSelect: 'none',
      textDecoration: 'none',
    }}
  >
    debugger<span style={{ color: '#ef4444' }}>.</span>sh
  </a>
);
