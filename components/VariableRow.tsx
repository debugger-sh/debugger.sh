'use client';

import { useEffect, useState } from 'react';

import { presentStanfordVariable, stanfordCollectionName } from '@/lib/stanford/formatters';

import type { DapVariable } from './dap-types';

export type VariableRowProps = {
  variable: DapVariable;
  expand: (variablesReference: number) => DapVariable[];
  depth: number;
};

export function VariableRow({ variable, expand, depth }: VariableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DapVariable[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const stanfordName = stanfordCollectionName(variable.type);
  // Once presented, only offer expand if there are logical children (empty → no chevron).
  const expandable =
    children !== null ? children.length > 0 : variable.variablesReference > 0;
  const displayValue = summary ?? (stanfordName ? stanfordName : variable.value);
  const displayType = stanfordName ?? variable.type;

  // Re-present whenever the DAP variable identity changes (new pause / step).
  // Stale variablesReference handles from a previous stop must not be reused.
  useEffect(() => {
    setExpanded(false);
    setChildren(null);
    setSummary(null);
    if (!stanfordName || variable.variablesReference <= 0) return;
    const presented = presentStanfordVariable(variable, expand);
    if (presented) {
      setSummary(presented.summary);
      setChildren(presented.children);
    }
  }, [variable, expand, stanfordName]);

  const toggle = () => {
    if (!expandable) return;
    if (!expanded && children === null && variable.variablesReference > 0) {
      const presented = presentStanfordVariable(variable, expand);
      if (presented) {
        setSummary(presented.summary);
        setChildren(presented.children);
      } else {
        setChildren(expand(variable.variablesReference));
      }
    }
    setExpanded((e) => !e);
  };

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <div
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          padding: '2px 4px',
          borderRadius: 2,
          cursor: expandable ? 'pointer' : 'default',
          minWidth: 0,
        }}
      >
        <span style={{ width: 10, color: '#666', flexShrink: 0 }}>
          {expandable ? (expanded ? '▾' : '▸') : ''}
        </span>
        <span style={{ color: '#e5e5e5', flexShrink: 0 }}>{variable.name}</span>
        {displayType && (
          <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0 }}>{displayType}</span>
        )}
        <span
          title={displayValue}
          style={{
            color: '#94a3b8',
            marginLeft: 'auto',
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {displayValue}
        </span>
      </div>
      {expanded &&
        children?.map((child, index) => (
          <VariableRow
            key={`${child.name}-${index}`}
            variable={child}
            expand={expand}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
