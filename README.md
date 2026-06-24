# debugger.sh

An in-browser C and Python IDE for [`debugger-sh`](https://www.npmjs.com/package/debugger-sh). Editor, breakpoints, step debugging, interactive terminal, call stack, and variable inspector — all client-side.

Lives at https://debugger.sh

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

The Next dev server sets COOP/COEP headers (see [next.config.ts](./next.config.ts)) so `SharedArrayBuffer` works for the wasm runtime.

## Layout

```
app/page.tsx              wires components + useExecution
hooks/useExecution.ts     runtime + DAP lifecycle; sets filterInternals for Python
components/
  CodeEditor.tsx          CodeMirror + breakpoint gutter + stopped-line highlight
  Terminal.tsx            xterm.js (stdin + stdout)
  VariablesPanel.tsx      call stack + variables
  SourceActions.tsx       run / stop / step toolbar
  ResizableWorkspace.tsx  draggable VS Code-style dock
```

## Bumping the runtime

```bash
npm i debugger-sh@latest
```

## Debug presentation

Stack and variable filtering is handled by the engine, not duplicated in the IDE:

- **Python stack:** `engine.debugger.filterInternals = true` in `useExecution.ts` hides bridge/Bdb frames. Set to `false` and filter on `presentationHint: "subtle"` for a “show internals” toggle.
- **Python locals:** dunder names (`__*__`) are stripped in the engine’s DAP adapter.
- **Frame names:** module scope in `/main.py` is labeled `__main__`; a function named `main` stays `main`.

Details: [engine integration guide — Presentation filtering](https://github.com/debugger-sh/engine/blob/main/docs/integration.md#presentation-filtering-python) (or `../engine/docs/integration.md` when developing locally).

## Deploy

Static Next export (`output: 'export'`) served by a Cloudflare Worker. Pushing to `main` runs `npm run build` then `npx wrangler deploy` (~30s). [`public/_headers`](./public/_headers) carries COOP/COEP in production since the Next `headers()` config is dropped during static export.
