export type Lang = 'c' | 'python';

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

int add(int a, int b) {
  return a + b;
}

int main(void) {
  int x = 1;
  int y = 2;
  int z = add(x, y);
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
    defaultCode: `data = {"users": [{"id": 1, "name": "alice"}, {"id": 2, "name": "bob"}]}
items = [10, 20, 30]

def add(a, b):
    return a + b

x = 1
y = 2
z = add(x, y)
print(f"z={z}")
`,
    debug: true,
  },
};

/** @deprecated Use LANGS[lang].sourcePath instead. */
export const SOURCE_PATH = LANGS.c.sourcePath;

/** @deprecated Use LANGS.c.defaultCode instead. */
export const defaultCode = LANGS.c.defaultCode;
