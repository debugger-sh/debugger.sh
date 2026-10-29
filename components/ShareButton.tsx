'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { createShareAction } from '@/lib/share/actions';
import type { WorkspaceState } from '@/lib/share/types';

type ShareButtonProps = {
  getState: () => WorkspaceState;
};

type Status = 'idle' | 'saving' | 'copied' | 'error';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function ShareButton({ getState }: ShareButtonProps) {
  const [status, setStatus] = useState<Status>('idle');

  const onShare = useCallback(async () => {
    if (status === 'saving') return;
    setStatus('saving');
    try {
      const id = await createShareAction(getState());
      const url = `${window.location.origin}/${id}`;
      const copied = await copyText(url);
      if (!copied) throw new Error('clipboard unavailable');
      setStatus('copied');
      toast.success('Link copied');
      window.setTimeout(() => setStatus('idle'), 1600);
    } catch (err) {
      console.error('share failed', err);
      setStatus('error');
      toast.error('Share failed');
      window.setTimeout(() => setStatus('idle'), 2000);
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
      className="ide-icon-btn ide-share-btn"
      aria-label={label}
      title={label}
      disabled={status === 'saving'}
      data-status={status}
      onClick={() => void onShare()}
    >
      <span className="ide-share-icons" aria-hidden>
        <span className="ide-share-icon" data-active={status === 'idle' || status === 'error'}>
          <ShareIcon />
        </span>
        <span className="ide-share-icon" data-active={status === 'saving'}>
          <SpinnerIcon />
        </span>
        <span className="ide-share-icon" data-active={status === 'copied'}>
          <CheckIcon />
        </span>
      </span>
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
    >
      <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="ide-spinner">
      <circle
        cx="8"
        cy="8"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.25"
      />
      <path
        d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
