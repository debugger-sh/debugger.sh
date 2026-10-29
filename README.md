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

### Share links (local Supabase)

Sharing saves `{ lang, code, layout }` to a Supabase `shares` table (publishable key + RLS). The server loads `/{id}` before paint (OpenNext SSR); **Share** copies that URL.

```bash
# Requires Docker. Ports are offset (API 54421) so another local Supabase can coexist.
npx supabase start
npx supabase status -o env
```

Copy `API_URL` → `NEXT_PUBLIC_SUPABASE_URL` and `PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` into `.env.local` (see `.env.local.example`), then restart `npm run dev`.

## CS106B / SimpleTest

- Stanford collection headers live in `cs106b/cpp/` (no graphics). `npm run build:cs106b` compiles them to `public/cs106b/{run,debug}.a` + `support.pch` with the same wasm32-wasip1 clang the engine uses.
- `#include "map.h"` / `Vector` / etc. work in C++ mode. Lexicon, simpio, and other headless APIs are included; graphics are not.
- `SimpleTest.h` is always available (same as Stanford headers). Live `PROVIDED_TEST` / `STUDENT_TEST` cases run on **Run** after `main` (if present); results show in the **Tests** pane.
- Stanford variable formatting is isolated in `lib/stanford/formatters.ts`.

## Layout

```
app/page.tsx              server home (+ legacy /?s=<id>)
app/[shareId]/page.tsx    server share load → IdeApp
app/IdeApp.tsx            client IDE shell
hooks/useExecution.ts     runtime + DAP lifecycle; Stanford + SimpleTest wiring
cs106b/                   Stanford sources + precompile script
lib/simpletest/           SimpleTest.h/cpp + runner
lib/stanford/             artifact loader + DAP formatters (isolated)
lib/testing/              test prepare + stdout protocol
lib/share/                Supabase share create (client) / load (SSR)
supabase/                 local Supabase config + migrations
components/
  CodeEditor.tsx          CodeMirror + breakpoint gutter + stopped-line highlight
  Terminal.tsx / TestsPanel.tsx
  VariablesPanel.tsx      call stack + variables (+ Stanford formatters)
  SourceActions.tsx       run / stop / step toolbar
  ShareButton.tsx         top-right share → clipboard
  ResizableWorkspace.tsx  VS Code-style dock tree
```

## Debug presentation

Stack and variable filtering is handled by the engine, not duplicated in the IDE:

- **Python stack:** `engine.debugger.filterInternals = true` in `useExecution.ts` hides bridge/Bdb frames. Set to `false` and filter on `presentationHint: "subtle"` for a “show internals” toggle.
- **Python locals:** dunder names (`__*__`) are stripped in the engine’s DAP adapter.
- **Frame names:** module scope in `/main.py` is labeled `__main__`; a function named `main` stays `main`.

Details: [engine integration guide — Presentation filtering](https://github.com/debugger-sh/engine/blob/main/docs/integration.md#presentation-filtering-python).

## Deploy

Next.js on Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare) (`npm run deploy`). Share routes SSR from Supabase so `/{id}` paints with code/layout already loaded.

**Schema:** connect the GitHub repo in the Supabase dashboard (Integration → GitHub). Migrations under `supabase/migrations/` apply when they land on the watched branch.

**Frontend:** Supabase URL + publishable key are **Worker secrets** (not in git). Set once per account:

```bash
npx wrangler login   # once
printf '%s' 'https://YOUR_PROJECT.supabase.co' | npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
printf '%s' 'sb_publishable_…' | npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run deploy       # or: npm run preview
```

Local `next dev` uses `.env.local`. Local Workers preview uses `.dev.vars` (gitignored).

COOP/COEP come from [`next.config.ts`](./next.config.ts) (required for SharedArrayBuffer / the wasm runtime).

Day-to-day schema: `npx supabase migration new <name>` → edit SQL → `npx supabase db reset` locally → merge; Supabase GitHub integration updates remote.
