'use client';

import { LANGS, type Lang } from '@/components/constants';

export type LanguageSelectProps = {
  value: Lang;
  onChange: (lang: Lang) => void;
  disabled?: boolean;
};

export function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  return (
    <select
      className="ide-lang-select"
      aria-label="Language"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Lang)}
    >
      {(Object.keys(LANGS) as Lang[]).map((lang) => (
        <option key={lang} value={lang}>
          {LANGS[lang].label}
        </option>
      ))}
    </select>
  );
}
