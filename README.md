# debugger.sh

An in-browser C++/Python/Rust IDE over [`debugger-sh`](https://github.com/justinvassantachart/engine) (WebIDE fork). Editor, breakpoints, step debugging, interactive terminal, call stack, variable inspector, Stanford CS106B collections, and SimpleTest — all client-side.

Lives at https://debugger.sh

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. CS106B archives/PCH are built automatically on `predev` / `prebuild`.

The Next dev server sets COOP/COEP headers (see [next.config.ts](./next.config.ts)) so `SharedArrayBuffer` works for the wasm runtime.

## CS106B / SimpleTest

- Stanford collection headers live in `cs106b/cpp/` (no graphics). `npm run build:cs106b` compiles them to `public/cs106b/{run,debug}.a` + `support.pch` with the same wasm32-wasip1 clang the engine uses.
- `#include "map.h"` / `Vector` / etc. work in C++ mode. Lexicon, simpio, and other headless APIs are included; graphics are not.
- `SimpleTest.h` is always available (same as Stanford headers). Live `PROVIDED_TEST` / `STUDENT_TEST` cases run on **Run** after `main` (if present); results show in the **Tests** pane.
- Stanford variable formatting is isolated in `lib/stanford/formatters.ts`.

## Layout

```
app/page.tsx              wires components + useExecution
hooks/useExecution.ts     runtime + DAP lifecycle; Stanford + SimpleTest wiring
cs106b/                   Stanford sources + precompile script
lib/simpletest/           SimpleTest.h/cpp + runner
lib/stanford/             artifact loader + DAP formatters (isolated)
lib/testing/              test prepare + stdout protocol
components/
  CodeEditor.tsx          CodeMirror + breakpoint gutter + stopped-line highlight
  Terminal.tsx / TestsPanel.tsx
  VariablesPanel.tsx      call stack + variables (+ Stanford formatters)
  SourceActions.tsx       run / stop / step toolbar
  ResizableWorkspace.tsx  draggable VS Code-style dock
```

## Debug presentation

Stack and variable filtering is handled by the engine, not duplicated in the IDE:

- **Python stack:** `engine.debugger.filterInternals = true` in `useExecution.ts` hides bridge/Bdb frames. Set to `false` and filter on `presentationHint: "subtle"` for a “show internals” toggle.
- **Python locals:** dunder names (`__*__`) are stripped in the engine’s DAP adapter.
- **Frame names:** module scope in `/main.py` is labeled `__main__`; a function named `main` stays `main`.

Details: [engine integration guide — Presentation filtering](https://github.com/debugger-sh/engine/blob/main/docs/integration.md#presentation-filtering-python).

## Deploy

Static Next export (`output: 'export'`) served by a Cloudflare Worker. Pushing to `main` runs `npm run build` then `npx wrangler deploy` (~30s). [`public/_headers`](./public/_headers) carries COOP/COEP in production since the Next `headers()` config is dropped during static export.
