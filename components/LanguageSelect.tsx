'use client';

import { LANGS, type Lang } from '@/components/constants';

export type LanguageSelectProps = {
  value: Lang;
  onChange: (lang: Lang) => void;
  disabled?: boolean;
};

export function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  return (
    <div className="ide-lang-switch" role="radiogroup" aria-label="Language">
      {(Object.keys(LANGS) as Lang[]).map((lang) => {
        const active = value === lang;
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`ide-lang-switch__btn${active ? ' is-active' : ''}`}
            onClick={() => onChange(lang)}
          >
            {LANGS[lang].label}
          </button>
        );
      })}
    </div>
  );
}
