export type Lang = 'c' | 'python' | 'rust';

type LangConfig = {
  label: string;
  /** The source file, relative to the engine's root (toolchains take relative globs). */
  fsKey: string;
  /** The source file's absolute path, as the debugger reports it. */
  sourcePath: string;
  defaultCode: string;
};

export const LANGS: Record<Lang, LangConfig> = {
  c: {
    label: 'C++',
    fsKey: 'main.c',
    sourcePath: '/main.c',
    defaultCode: `#include <iostream>
#include "vector.h"
#include "SimpleTest.h"

using namespace std;

PROVIDED_TEST("Vector basic ops") {
  Vector<int> v;
  v.add(1);
  v.add(2);
  EXPECT_EQUAL(v.size(), 2);
  EXPECT_EQUAL(v[0], 1);
}

int main() {
  Vector<string> words;
  words.add("hello");
  words.add("world");
  cout << "main: " << words << endl;
  return 0;
}
`,
  },
  python: {
    label: 'Python',
    fsKey: 'main.py',
    sourcePath: '/main.py',
    defaultCode: `print("Hello, world!")
`,
  },
  rust: {
    label: 'Rust',
    fsKey: 'main.rs',
    sourcePath: '/main.rs',
    defaultCode: `fn main() {
    println!("Hello, world!");
}
`,
  },
};
