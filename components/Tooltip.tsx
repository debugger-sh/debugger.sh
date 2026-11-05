'use client';

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Instant hover tooltip, portaled above overflow/stacking contexts. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);

  return (
    <span
      className="ide-tooltip-wrap"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ left: r.left + r.width / 2, top: r.top - 6 });
      }}
      onMouseLeave={() => setTip(null)}
    >
      {children}
      {tip &&
        createPortal(
          <span className="ide-tooltip" style={{ left: tip.left, top: tip.top }}>
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
