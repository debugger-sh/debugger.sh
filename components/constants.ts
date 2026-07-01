export type Lang = 'c' | 'python' | 'rust';

export type LangConfig = {
  label: string;
  fsKey: string;
  /** DAP `setBreakpoints` path — must match the worker's virtual source path. */
  sourcePath: string;
  defaultCode: string;
  /** Whether this language supports breakpoints / the DAP debugger. */
  debug: boolean;
};

export const LANGS: Record<Lang, LangConfig> = {
  c: {
    label: 'C',
    fsKey: 'main.c',
    sourcePath: '/main.c',
    defaultCode: `#include <stdio.h>

int main(void) {
  printf("Hello, world!\\n");
  return 0;
}
`,
    debug: true,
  },
  python: {
    label: 'Python',
    fsKey: 'main.py',
    sourcePath: '/main.py',
    defaultCode: `print("Hello, world!")
`,
    debug: true,
  },
  rust: {
    label: 'Rust',
    fsKey: 'main.rs',
    sourcePath: '/main.rs',
    defaultCode: `fn main() {
    println!("Hello, world!");
}
`,
    debug: true,
  },
};

/** @deprecated Use LANGS[lang].sourcePath instead. */
export const SOURCE_PATH = LANGS.c.sourcePath;

/** @deprecated Use LANGS.c.defaultCode instead. */
export const defaultCode = LANGS.c.defaultCode;
