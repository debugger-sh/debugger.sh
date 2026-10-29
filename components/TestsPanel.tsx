'use client';

import type { TestInfo, TestResult, TestRunState } from '@/lib/testing/protocol';

export type TestsPanelProps = {
  state: TestRunState | null;
  isRunning: boolean;
};

export function TestsPanel({ state, isRunning }: TestsPanelProps) {
  const tests = state?.tests ?? [];
  const results = state?.results ?? new Map<string, TestResult>();
  const passed = [...results.values()].filter((r) => r.status === 'passed').length;

  let status = 'Run the code to see which tests are passing';
  if (isRunning && !state?.finished) status = 'Running…';
  else if (state?.terminated) status = state.terminated.message ?? state.terminated.reason;
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
      <div style={{ padding: '8px 12px', color: '#94a3b8', borderBottom: '1px solid #1a1a1a' }}>
        {status}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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

  return (
    <div style={{ padding: '6px 12px', borderLeft: `2px solid ${status === 'passed' || status === 'failed' || status === 'errored' ? color : 'transparent'}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color, width: 12, flexShrink: 0 }}>{mark}</span>
        <span style={{ wordBreak: 'break-word' }}>{test.name}</span>
      </div>
      {(status === 'failed' || status === 'errored') && result?.message && (
        <div style={{ margin: '4px 0 0 20px', color: '#fca5a5', whiteSpace: 'pre-wrap' }}>
          {result.message}
          {result.actual && (
            <div>
              {result.actual.expression} = {result.actual.value}
            </div>
          )}
          {result.expected && (
            <div>
              expected {result.expected.expression} = {result.expected.value}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
