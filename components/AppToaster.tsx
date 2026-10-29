'use client';

import { Toaster } from 'sonner';

import './dock.css';

export function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-center"
      gap={8}
      offset={16}
      duration={2800}
      toastOptions={{
        className: 'ide-toast',
        style: {
          background: '#111',
          border: '1px solid #262626',
          color: '#f5f5f5',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.01em',
          borderRadius: '8px',
          boxShadow: '0 10px 28px rgba(0, 0, 0, 0.4)',
          padding: '10px 14px',
        },
      }}
    />
  );
}
