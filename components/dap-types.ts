/** DAP shapes the IDE actually uses (not a full protocol model). */

export type DapResponse<T = unknown> = {
  type: 'response';
  seq: number;
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: T;
};

export type StackFrame = {
  id: number;
  name: string;
  line: number;
  column: number;
  source?: { path?: string };
};

export type Scope = {
  name: string;
  variablesReference: number;
  expensive: boolean;
};

export type DapVariable = {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  /** Present when the engine knows indexed child counts (e.g. empty std::vector → 0). */
  indexedVariables?: number;
  namedVariables?: number;
};

export type ScopeView = {
  name: string;
  variables: DapVariable[];
};
