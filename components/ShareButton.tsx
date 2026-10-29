'use client';

import { useCallback, useState } from 'react';

import { createShare, shareUrl } from '@/lib/share/api';
import type { WorkspaceState } from '@/lib/share/types';

type ShareButtonProps = {
  getState: () => WorkspaceState;
};

type Status = 'idle' | 'saving' | 'copied' | 'error';

export function ShareButton({ getState }: ShareButtonProps) {
  const [status, setStatus] = useState<Status>('idle');

  const onShare = useCallback(async () => {
    if (status === 'saving') return;
    setStatus('saving');
    try {
      const id = await createShare(getState());
      const url = shareUrl(id);
      await navigator.clipboard.writeText(url);
      setStatus('copied');
      window.setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      console.error('share failed', err);
      setStatus('error');
      window.setTimeout(() => setStatus('idle'), 2500);
    }
  }, [getState, status]);

  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'copied'
        ? 'Link copied'
        : status === 'error'
          ? 'Share failed'
          : 'Share';

  return (
    <button
      type="button"
      className="ide-share-btn"
      aria-label={label}
      title={label}
      disabled={status === 'saving'}
      onClick={() => void onShare()}
    >
      {status === 'copied' ? <CheckIcon /> : <ShareIcon />}
      <span>{label}</span>
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="3.5" r="1.75" />
      <circle cx="12" cy="12.5" r="1.75" />
      <circle cx="4" cy="8" r="1.75" />
      <path d="M5.6 7.1 L10.4 4.4 M5.6 8.9 L10.4 11.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
    </svg>
  );
}
