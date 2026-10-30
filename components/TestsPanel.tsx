'use client';

import type { ReactNode } from 'react';

import type { TestInfo, TestResult, TestRunState } from '@/lib/testing/protocol';

export type TestsPanelProps = {
  state: TestRunState | null;
  isRunning: boolean;
};

export function TestsPanel({ state, isRunning }: TestsPanelProps) {
  const tests = state?.tests ?? [];
  const results = state?.results ?? new Map<string, TestResult>();
  const passed = [...results.values()].filter((r) => r.status === 'passed').length;

  let status: ReactNode = 'Run the code to see which tests are passing';
  let statusColor = '#94a3b8';
  if (isRunning && !state?.finished) status = 'Running…';
  else if (state?.error) {
    statusColor = '#fca5a5';
    status = (
      <>
        Couldn&apos;t run tests. Please see the{' '}
        <span style={{ fontWeight: 600 }}>Terminal</span> for more info
      </>
    );
  } else if (state?.terminated) status = state.terminated.message ?? state.terminated.reason;
  else if (state && tests.length) status = `${passed}/${tests.length} passed`;

  return (
    <aside
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        boxSizing: 'border-box',
        minHeight: 0,
        color: '#e5e5e5',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <div style={{ padding: '8px 12px', color: statusColor, borderBottom: '1px solid #1a1a1a' }}>
        {status}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', colorScheme: 'dark' }}>
        {tests.map((test) => (
          <TestRow key={test.key} test={test} result={results.get(test.key)} />
        ))}
      </div>
    </aside>
  );
}

function TestRow({ test, result }: { test: TestInfo; result?: TestResult }) {
  const status = result?.status;
  const color =
    status === 'passed' ? '#34d399' : status === 'failed' || status === 'errored' ? '#f87171' : '#64748b';
  const mark = status === 'passed' ? '✓' : status === 'failed' || status === 'errored' ? '✗' : status === 'running' ? '…' : '·';
  const failed = status === 'failed' || status === 'errored';
  const failLine = result?.line ?? test.line;

  return (
    <div style={{ padding: '6px 12px', borderLeft: `2px solid ${status === 'passed' || failed ? color : 'transparent'}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color, width: 12, flexShrink: 0 }}>{mark}</span>
        <span style={{ wordBreak: 'break-word' }}>{test.name}</span>
      </div>
      {failed && (result?.message || result?.actual || result?.expected) && (
        <div style={{ margin: '4px 0 0 20px', color: '#fca5a5', whiteSpace: 'pre-wrap' }}>
          {result?.message && <div>{result.message}</div>}
          {result?.actual && (
            <div>
              {failLine != null && (
                <>
                  <span style={{ fontWeight: 700 }}>Line {failLine}</span>
                  {': '}
                </>
              )}
              {result.actual.expression} = {result.actual.value}
            </div>
          )}
          {result?.expected && (
            <div>
              expected {result.expected.expression} = {result.expected.value}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
