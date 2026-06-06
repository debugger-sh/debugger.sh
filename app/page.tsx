'use client';

import { useCallback, useRef, useState } from 'react';

import CodeEditor from '@/components/CodeEditor';
import { LANGS, type Lang } from '@/components/constants';
import { LanguageSelect } from '@/components/LanguageSelect';
import ResizableWorkspace from '@/components/ResizableWorkspace';
import { SourceActions } from '@/components/SourceActions';
import Terminal, { type TerminalHandle } from '@/components/Terminal';
import { VariablesPanel } from '@/components/VariablesPanel';
import { useExecution } from '@/hooks/useExecution';

export default function Page() {
  const [lang, setLang] = useState<Lang>('c');
  const [sources, setSources] = useState<Record<Lang, string>>(() => ({
    c: LANGS.c.defaultCode,
    python: LANGS.python.defaultCode,
  }));
  const [breakpointsByLang, setBreakpointsByLang] = useState<Record<Lang, Set<number>>>(() => ({
    c: new Set(),
    python: new Set(),
  }));
  const terminalRef = useRef<TerminalHandle | null>(null);
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

  return (
    <main
      style={{
        height: '100vh',
        padding: 16,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <Logo />
      <ResizableWorkspace
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
            />
          ),
          output: <Terminal ref={terminalRef} />,
        }}
        paneActions={{
          editor: (
            <>
              <LanguageSelect value={lang} onChange={setLang} disabled={exec.isRunning} />
              <SourceActions
                isRunning={exec.isRunning}
                isPaused={exec.isPaused}
                onRun={() => void exec.run(code, breakpoints, lang)}
              onStop={exec.stop}
              onContinue={exec.resume}
              onStepOver={exec.stepOver}
              onStepIn={exec.stepIn}
              onStepOut={exec.stepOut}
              />
            </>
          ),
        }}
      />
    </main>
  );
}

const Logo = () => (
  <a href="https://github.com/debugger-sh/debugger.sh" target="_blank" rel="noreferrer" style={{ padding: '0 4px', fontSize: 12, color: '#6b7280', letterSpacing: '0.02em', userSelect: 'none', textDecoration: 'none' }}>
    debugger<span style={{ color: '#ef4444' }}>.</span>sh
  </a>
);
