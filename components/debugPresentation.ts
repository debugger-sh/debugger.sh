import type { DapVariable, StackFrame } from '@/components/dap-types';

const MAX_VALUE_LEN = 120;

/** Python paths injected by the engine, not student sources. */
export function isUserPythonSource(path: string | undefined): boolean {
  if (!path) return false;
  const base = path.split('/').pop() ?? path;
  if (base === '_bridge.py') return false;
  if (path.startsWith('/lib/') || path.includes('/Lib/') || path.includes('bdb.py')) return false;
  return base === 'main.py';
}

export function formatPythonFrameName(name: string): string {
  return name === '<module>' ? 'main' : name;
}

export function presentPythonStack(frames: StackFrame[]): StackFrame[] {
  const filtered = frames
    .filter((f) => {
      const path = f.source?.path;
      if (path) return isUserPythonSource(path);
      return f.name === '<module>' || f.name === 'main';
    })
    .map((f) => ({ ...f, name: formatPythonFrameName(f.name) }));
  return filtered.length > 0 ? filtered : frames;
}

function shouldHidePythonVariable(name: string): boolean {
  if (name === '__builtins__') return true;
  if (name.startsWith('__') && name.endsWith('__')) return true;
  return false;
}

function truncateValue(value: string): string {
  if (value.length <= MAX_VALUE_LEN) return value;
  return `${value.slice(0, MAX_VALUE_LEN - 1)}…`;
}

export function presentPythonVariables(variables: DapVariable[]): DapVariable[] {
  return variables
    .filter((v) => !shouldHidePythonVariable(v.name))
    .map((v) => ({ ...v, value: truncateValue(v.value) }));
}
