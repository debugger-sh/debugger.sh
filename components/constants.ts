export type Lang = 'c' | 'python';

export type LangConfig = {
  label: string;
  fsKey: string;
  /** DAP `setBreakpoints` path — must match the worker's virtual source path. */
  sourcePath: string;
  defaultCode: string;
  /** Whether the engine runs with the DAP debugger enabled. */
  debug: boolean;
};

export const LANGS: Record<Lang, LangConfig> = {
  c: {
    label: 'C',
    fsKey: 'main.c',
    sourcePath: '/main.c',
    defaultCode: `#include <stdio.h>

int main(void) {
  int x = 1;
  int y = 2;
  int z = x + y;
  printf("z=%d\\n", z);
  return 0;
}
`,
    debug: true,
  },
  python: {
    label: 'Python',
    fsKey: 'main.py',
    sourcePath: '/main.py',
    defaultCode: `x = 1
y = 2
z = x + y
print(f"z={z}")
`,
    debug: false,
  },
};

/** @deprecated Use LANGS[lang].sourcePath instead. */
export const SOURCE_PATH = LANGS.c.sourcePath;

/** @deprecated Use LANGS.c.defaultCode instead. */
export const defaultCode = LANGS.c.defaultCode;
