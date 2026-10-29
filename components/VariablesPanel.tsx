'use client';

import type { ReactNode } from 'react';

import type { DapVariable, ScopeView, StackFrame } from './dap-types';
import { DebugControls, type DebugControlsProps } from './SourceActions';
import { VariableRow } from './VariableRow';

export type VariablesPanelProps = {
  frames: StackFrame[];
  selectedFrameId: number | null;
  onSelectFrame: (id: number) => void;
  scopes: ScopeView[];
  expandVariable: (ref: number) => DapVariable[];
  isPaused: boolean;
  debugControls?: DebugControlsProps;
};

export function VariablesPanel(props: VariablesPanelProps) {
  return (
    <aside
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        boxSizing: 'border-box',
        minHeight: 0,
      }}
    >
      {props.isPaused && props.debugControls && (
        <DebugControls {...props.debugControls} />
      )}
      {props.frames.length > 0 && <SectionHeader>call stack</SectionHeader>}
      <div style={{ maxHeight: '38%', overflowY: 'auto', flexShrink: 0, colorScheme: 'dark' }}>
        <CallStack
          frames={props.frames}
          selectedFrameId={props.selectedFrameId}
          onSelectFrame={props.onSelectFrame}
        />
      </div>
      {props.scopes.length > 0 && <SectionHeader>variables</SectionHeader>}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0', colorScheme: 'dark' }}>
        <Variables scopes={props.scopes} expandVariable={props.expandVariable} />
      </div>
    </aside>
  );
}

function CallStack({
  frames,
  selectedFrameId,
  onSelectFrame,
}: Pick<VariablesPanelProps, 'frames' | 'selectedFrameId' | 'onSelectFrame'>) {
  if (frames.length === 0) return null;
  return (
    <>
      {frames.map((f) => {
        const selected = selectedFrameId === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelectFrame(f.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '4px 12px',
              border: 'none',
              cursor: 'pointer',
              background: selected ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
              borderLeft: `2px solid ${selected ? '#818cf8' : 'transparent'}`,
              color: '#e5e5e5',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: selected ? 600 : 400,
            }}
          >
            {f.name}
            {f.line != null && (
              <span style={{ color: '#777', fontWeight: 400, marginLeft: 4 }}>:{f.line}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

function Variables({
  scopes,
  expandVariable,
}: Pick<VariablesPanelProps, 'scopes' | 'expandVariable'>) {
  if (scopes.length === 0) return null;
  return (
    <>
      {scopes.map((scope) => (
        <div key={scope.name} style={{ marginBottom: 8 }}>
          <div
            style={{
              padding: '2px 12px',
              fontSize: 10,
              letterSpacing: 0.6,
              color: '#a5b4fc',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {scope.name}
          </div>
          {scope.variables.length > 0 && (
            <div style={{ paddingLeft: 8 }}>
              {scope.variables.map((v) => (
                <VariableRow key={v.name} variable={v} expand={expandVariable} depth={0} />
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.8,
        color: '#888',
        textTransform: 'uppercase',
        borderBottom: '1px solid #1a1a1a',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
