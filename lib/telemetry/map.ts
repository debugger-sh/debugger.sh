import type { DebugFrame, DebugVariable } from './types';

export type VariableLike = {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
};

export type ScopeLike = {
  name: string;
  variables: VariableLike[];
};

export function toDebugVariable(variable: VariableLike): DebugVariable {
  return {
    id: variable.variablesReference > 0 ? String(variable.variablesReference) : variable.name,
    name: variable.name,
    type: variable.type ?? '',
    value: variable.value,
  };
}

/** Split DAP scopes into the frame's args and locals. Empty lists are omitted. */
export function toDebugFrame(index: number, name: string, scopes: ScopeLike[]): DebugFrame {
  const args: DebugVariable[] = [];
  const locals: DebugVariable[] = [];
  for (const scope of scopes) {
    const label = scope.name.toLowerCase();
    const vars = scope.variables.map(toDebugVariable);
    if (label.includes('arg')) args.push(...vars);
    else if (label.includes('local')) locals.push(...vars);
  }
  return {
    index,
    name,
    ...(args.length ? { args } : {}),
    ...(locals.length ? { locals } : {}),
  };
}
