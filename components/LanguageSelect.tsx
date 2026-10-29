'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { LANGS, type Lang } from '@/components/constants';

export type LanguageSelectProps = {
  value: Lang;
  onChange: (lang: Lang) => void;
  disabled?: boolean;
};

export function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);

  const pick = (lang: Lang) => {
    onChange(lang);
    close();
  };

  return (
    <div className="ide-lang-menu" ref={rootRef}>
      <button
        type="button"
        className="ide-icon-btn"
        aria-label={`Language: ${LANGS[value].label}`}
        title={`Language: ${LANGS[value].label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsIcon />
      </button>
      {open && (
        <ul id={listId} className="ide-lang-dropdown" role="listbox" aria-label="Language">
          {(Object.keys(LANGS) as Lang[]).map((lang) => {
            const selected = lang === value;
            return (
              <li key={lang} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="ide-lang-option"
                  data-selected={selected ? 'true' : undefined}
                  onClick={() => pick(lang)}
                >
                  <span>{LANGS[lang].label}</span>
                  {selected && <CheckIcon />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
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
