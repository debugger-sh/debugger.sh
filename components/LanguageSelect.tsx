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
      value={value}
      disabled={disabled}
      aria-label="language"
      onChange={(e) => onChange(e.target.value as Lang)}
      style={{
        appearance: 'none',
        background: '#141414',
        color: '#a3a3a3',
        border: '1px solid #262626',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {(Object.keys(LANGS) as Lang[]).map((lang) => (
        <option key={lang} value={lang}>
          {LANGS[lang].label}
        </option>
      ))}
    </select>
  );
}
