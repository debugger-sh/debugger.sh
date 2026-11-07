'use client';

import { useEffect, useMemo, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { Decoration, EditorView, gutter, GutterMarker, type Panel } from '@codemirror/view';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  search,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { tags as t } from '@lezer/highlight';

import { LANGS, type Lang } from '@/components/constants';
import { telemetryEditor } from '@/lib/telemetry/editor';


// ---------------------------------------------------------------------------
// Language extensions
// ---------------------------------------------------------------------------

const LANG_EXTENSIONS: Record<Lang, () => Extension> = {
  c: cpp,
  python: python,
  rust: rust,
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
//
// Every color and dimension that affects the editor's look lives here so
// tweaking the palette is a one-stop edit. We deliberately use `theme="none"`
// on the CodeMirror component below so nothing else colors the editor — this
// object is the single source of truth.

const theme = {
  bg: '#0d0d0d',
  fg: '#e5e7eb',
  caret: '#f1f5f9',
  selection: '#1e3a8a',
  stoppedLine: 'rgba(251, 191, 36, 0.18)',
  gutter: {
    bg: '#0a0a0a',
    border: '1px solid #1a1a1a',
    fg: '#666',
    hoverBg: '#141414',
    minWidth: 40, // px — tightens the gap between the breakpoint dot and number
  },
  breakpoint: {
    dotSize: 10, // px
    dotMargin: 6, // px (left)
    fill: '#ef4444',
    holeBorder: '1px solid #2a2a2a',
  },
  font: {
    family:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    size: '13px',
    // 1.54 ≈ 20px on a 13px font — matches the original textarea exactly.
    lineHeight: '1.54',
  },
  // Tailwind 400-series — saturated enough to pop on a near-black background
  // while staying coherent with the rest of the IDE's palette.
  syntax: {
    keyword: '#c084fc', // violet-400  — int, void, return, if, for, ...
    type: '#f472b6', // pink-400    — typedef'd type names
    fn: '#60a5fa', // blue-400    — function names at call/declaration sites
    string: '#4ade80', // green-400   — "literal"
    number: '#fb923c', // orange-400  — 1, 2, true
    preproc: '#22d3ee', // cyan-400    — #include, #define
    comment: '#52525b', // zinc-600    — // ... (italic)
    variable: '#e2e8f0', // slate-200   — local identifiers
    operator: '#94a3b8', // slate-400   — +, -, ;, (), {}, ...
  },
  find: {
    bg: '#111',
    border: '#1a1a1a',
    inputBg: '#0a0a0a',
    muted: '#8a8a8a',
    match: 'rgba(250, 204, 21, 0.28)',
    matchSelected: 'rgba(250, 204, 21, 0.55)',
  },
} as const;

const editorChrome = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: theme.bg,
      color: theme.fg,
      fontSize: theme.font.size,
    },
    '.cm-scroller': {
      fontFamily: theme.font.family,
      lineHeight: theme.font.lineHeight,
    },
    // Strip CM defaults so vertical/horizontal rhythm matches the original
    // textarea (which had `padding: 0 12px`).
    '.cm-content': { caretColor: theme.caret, padding: '0' },
    '.cm-line': { padding: '0 12px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: theme.caret },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: theme.selection,
    },
    '.cm-gutters': {
      backgroundColor: theme.gutter.bg,
      borderRight: theme.gutter.border,
      color: theme.gutter.fg,
      cursor: 'pointer',
      userSelect: 'none',
    },
    '.cm-gutterElement:hover': { backgroundColor: theme.gutter.hoverBg },
    '.cm-stopped-line': { backgroundColor: theme.stoppedLine },
    // Two classes so this wins over the gutter hover rule above.
    '.cm-gutterElement.cm-stopped-gutter': { backgroundColor: theme.stoppedLine },
    // Extra pulse on top of the steady highlight. The class is added when
    // execution arrives at a line and removed from the steady-state decoration
    // so the animation can replay on the next stop.
    '.cm-stopped-flash': { animation: 'cm-stop-flash 620ms ease-out' },
    '@keyframes cm-stop-flash': {
      '0%': { boxShadow: 'inset 0 0 0 999px rgba(251, 191, 36, 0.55)' },
      '100%': { boxShadow: 'inset 0 0 0 999px rgba(251, 191, 36, 0)' },
    },
    // Browser-like find overlay: float top-right over the editor, no layout shift.
    // `!important` beats the inline `top: 0` CodeMirror sets on the panels host.
    '.cm-panels.cm-panels-top': {
      position: 'absolute',
      top: '8px !important',
      right: '12px',
      left: 'auto',
      width: 'auto',
      zIndex: 20,
      backgroundColor: 'transparent',
      borderBottom: 'none',
    },
    '.cm-search-overlay': {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      padding: '4px',
      backgroundColor: theme.find.bg,
      border: `1px solid ${theme.find.border}`,
      borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '12px',
      color: theme.fg,
    },
    '.cm-search-overlay input[main-field]': {
      width: '180px',
      margin: 0,
      padding: '5px 8px',
      border: `1px solid ${theme.find.border}`,
      borderRadius: '3px',
      backgroundColor: theme.find.inputBg,
      color: theme.fg,
      outline: 'none',
      font: 'inherit',
    },
    '.cm-search-overlay input[main-field]:focus': {
      borderColor: '#3b82f6',
    },
    '.cm-search-overlay .cm-search-count': {
      minWidth: '4.5em',
      padding: '0 6px',
      color: theme.find.muted,
      textAlign: 'center',
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
      userSelect: 'none',
    },
    '.cm-search-overlay .cm-search-count[data-empty="true"]': {
      color: '#f87171',
    },
    '.cm-search-overlay button': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      margin: 0,
      padding: 0,
      border: 'none',
      borderRadius: '3px',
      background: 'transparent',
      color: theme.find.muted,
      font: 'inherit',
      lineHeight: 1,
      cursor: 'pointer',
    },
    '.cm-search-overlay button:hover': {
      backgroundColor: '#181818',
      color: theme.fg,
    },
    '.cm-search-overlay button[name=close]': {
      color: theme.find.muted,
      fontSize: '14px',
    },
    '.cm-searchMatch': { backgroundColor: theme.find.match },
    '.cm-searchMatch-selected': { backgroundColor: theme.find.matchSelected },
  },
  { dark: true },
);

const codeSyntax = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.modifier, t.operatorKeyword], color: theme.syntax.keyword },
  { tag: [t.typeName, t.standard(t.typeName)], color: theme.syntax.type },
  { tag: t.function(t.variableName), color: theme.syntax.fn },
  { tag: [t.string, t.character, t.special(t.string)], color: theme.syntax.string },
  { tag: [t.number, t.bool], color: theme.syntax.number },
  { tag: [t.processingInstruction, t.meta], color: theme.syntax.preproc },
  { tag: [t.comment, t.lineComment, t.blockComment], color: theme.syntax.comment, fontStyle: 'italic' },
  { tag: t.variableName, color: theme.syntax.variable },
  { tag: [t.operator, t.punctuation, t.bracket, t.brace, t.paren, t.squareBracket], color: theme.syntax.operator },
]);

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------
//
// React owns the canonical Set<number>. We mirror it into `breakpointsField`
// via a dispatched `setBreakpointsEffect`; gutter clicks call back through the
// `toggleRef` so React stays the single source of truth. Stored as Set<number>
// (not RangeSet) because we don't track breakpoints across edits — matches the
// prior textarea behavior.

const setBreakpointsEffect = StateEffect.define<number[]>();

const breakpointsField = StateField.define<ReadonlySet<number>>({
  create: () => new Set(),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setBreakpointsEffect)) value = new Set(e.value);
    return value;
  },
});

// One combined gutter row: hole/dot on the left, line number on the right
// (matches the original textarea-era Gutter component layout).
class LineGutterMarker extends GutterMarker {
  constructor(
    readonly lineNumber: number,
    readonly hasBreakpoint: boolean,
    readonly stopped = false,
    readonly flash = false,
  ) {
    super();
    if (stopped) this.elementClass = flash ? 'cm-stopped-gutter cm-stopped-flash' : 'cm-stopped-gutter';
  }

  eq(other: GutterMarker): boolean {
    return (
      other instanceof LineGutterMarker &&
      other.lineNumber === this.lineNumber &&
      other.hasBreakpoint === this.hasBreakpoint &&
      other.stopped === this.stopped &&
      other.flash === this.flash
    );
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      `display:flex;align-items:center;justify-content:space-between;` +
      `min-width:${theme.gutter.minWidth}px;padding-right:8px;color:${theme.gutter.fg};`;

    const { dotSize, dotMargin, fill, holeBorder } = theme.breakpoint;
    const dot = document.createElement('span');
    dot.style.cssText =
      `flex:none;display:inline-block;margin-left:${dotMargin}px;` +
      `width:${dotSize}px;height:${dotSize}px;border-radius:50%;` +
      (this.hasBreakpoint
        ? `background:${fill};`
        : `background:transparent;border:${holeBorder};`);

    const num = document.createElement('span');
    num.textContent = String(this.lineNumber);
    num.style.cssText = 'font-variant-numeric:tabular-nums;';

    wrap.append(dot, num);
    return wrap;
  }
}

// `toggleRef` is a ref so the click handler always sees the freshest callback
// without having to rebuild the gutter extension on every parent render.
function makeLineGutter(
  toggleRef: { current: (line: number) => void },
  breakpointsEnabled: boolean,
) {
  return gutter({
    class: 'cm-line-gutter',
    lineMarker: (view, line) => {
      const lineNumber = view.state.doc.lineAt(line.from).number;
      const hasBreakpoint =
        breakpointsEnabled && view.state.field(breakpointsField).has(lineNumber);
      const stop = view.state.field(stoppedLineField);
      const stopped = stop.line === lineNumber;
      return new LineGutterMarker(lineNumber, hasBreakpoint, stopped, stopped && stop.flash > 0);
    },
    lineMarkerChange: (update) => {
      if (update.docChanged) return true;
      if (update.startState.field(breakpointsField) !== update.state.field(breakpointsField)) return true;
      const prev = update.startState.field(stoppedLineField);
      const next = update.state.field(stoppedLineField);
      return prev.line !== next.line || prev.flash !== next.flash;
    },
    // Spacer sized for up to 4-digit line numbers; gutter grows past this if needed.
    initialSpacer: () => new LineGutterMarker(9999, false),
    domEventHandlers: breakpointsEnabled
      ? {
          mousedown(view, line) {
            toggleRef.current(view.state.doc.lineAt(line.from).number);
            return true;
          },
        }
      : {},
  });
}

// ---------------------------------------------------------------------------
// Stopped-line highlight
// ---------------------------------------------------------------------------

type StopHighlight = {
  line: number | null;
  /** Non-zero while the arrival flash should play. A new value restarts it. */
  flash: number;
};

const setStoppedLineEffect = StateEffect.define<StopHighlight>();

const stoppedLineField = StateField.define<StopHighlight>({
  create: () => ({ line: null, flash: 0 }),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setStoppedLineEffect)) value = e.value;
    return value;
  },
});

const stoppedLineHighlight = EditorView.decorations.compute([stoppedLineField], (state) => {
  const { line, flash } = state.field(stoppedLineField);
  if (line == null || line < 1 || line > state.doc.lines) return Decoration.none;
  const cls = flash > 0 ? 'cm-stopped-line cm-stopped-flash' : 'cm-stopped-line';
  return Decoration.set([
    Decoration.line({ attributes: { class: cls } }).range(state.doc.line(line).from),
  ]);
});

function stopHighlight(line: number | null, flash = 0): StopHighlight {
  return { line, flash };
}

/**
 * Center `line` in the editor. Resolves immediately when the line is already
 * centered (or the file fits without scrolling). `onDone` runs once the smooth
 * scroll finishes so the arrival flash plays on the visible line.
 */
function scrollLineIntoView(view: EditorView, line: number, onDone: () => void): () => void {
  if (line < 1 || line > view.state.doc.lines) return () => {};
  const scroller = view.scrollDOM;
  const height = scroller.clientHeight;
  if (height <= 0) {
    onDone();
    return () => {};
  }
  const block = view.lineBlockAt(view.state.doc.line(line).from);
  const max = Math.max(0, scroller.scrollHeight - height);
  const target = Math.min(max, Math.max(0, block.top - (height - block.height) / 2));
  if (Math.abs(target - scroller.scrollTop) <= 1) {
    onDone();
    return () => {};
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    scroller.scrollTop = target;
    onDone();
    return () => {};
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    scroller.removeEventListener('scrollend', finish);
    window.clearTimeout(timer);
    onDone();
  };
  scroller.addEventListener('scrollend', finish);
  const timer = window.setTimeout(finish, 900);
  scroller.scrollTo({ top: target, behavior: 'smooth' });
  return () => {
    finished = true;
    scroller.removeEventListener('scrollend', finish);
    window.clearTimeout(timer);
  };
}

// ---------------------------------------------------------------------------
// Find overlay (Ctrl/Cmd+F)
// ---------------------------------------------------------------------------

function matchCount(view: EditorView, query: SearchQuery): string {
  if (!query.search) return '';
  if (!query.valid) return 'No results';
  let total = 0;
  let current = 0;
  const sel = view.state.selection.main;
  for (let cur = query.getCursor(view.state); ; ) {
    const step = cur.next();
    if (step.done) break;
    total++;
    if (step.value.from === sel.from && step.value.to === sel.to) current = total;
    if (total > 999) return `${current || '–'} of 999+`;
  }
  if (total === 0) return 'No results';
  return `${current || '–'} of ${total}`;
}

function createFindPanel(view: EditorView): Panel {
  let query = getSearchQuery(view.state);

  const input = Object.assign(document.createElement('input'), {
    type: 'text',
    value: query.search,
    placeholder: 'Find',
    autocomplete: 'off',
    spellcheck: false,
  });
  input.setAttribute('aria-label', 'Find');
  input.setAttribute('main-field', 'true');

  const count = document.createElement('span');
  count.className = 'cm-search-count';

  const btn = (name: string, label: string, title: string, onClick: () => void) => {
    const el = Object.assign(document.createElement('button'), {
      type: 'button',
      name,
      textContent: label,
      title,
    });
    el.setAttribute('aria-label', title);
    el.addEventListener('click', onClick);
    return el;
  };

  const refresh = () => {
    const text = matchCount(view, query);
    count.textContent = text;
    count.dataset.empty = text === 'No results' ? 'true' : 'false';
  };

  // findNext/Previous call selectSearchInput(), which re-selects the whole
  // query — collapse the caret so typing appends instead of replacing.
  const go = (fn: typeof findNext) => {
    fn(view);
    input.focus();
    const n = input.value.length;
    input.setSelectionRange(n, n);
    refresh();
  };

  const commit = () => {
    const next = new SearchQuery({ search: input.value });
    if (next.eq(query)) return;
    query = next;
    view.dispatch({ effects: setSearchQuery.of(next) });
    if (next.valid) go(findNext);
    else refresh();
  };

  input.addEventListener('input', commit);

  const dom = document.createElement('div');
  dom.className = 'cm-search-overlay';
  dom.append(
    input,
    count,
    btn('prev', '↑', 'Previous match', () => go(findPrevious)),
    btn('next', '↓', 'Next match', () => go(findNext)),
    btn('close', '×', 'Close', () => closeSearchPanel(view)),
  );
  dom.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel(view);
    } else if (e.key === 'Enter' && e.target === input) {
      e.preventDefault();
      go(e.shiftKey ? findPrevious : findNext);
    }
  });

  return {
    dom,
    top: true,
    mount: () => {
      input.select();
      refresh();
    },
    update: (u) => {
      for (const tr of u.transactions) {
        for (const e of tr.effects) {
          if (e.is(setSearchQuery) && !e.value.eq(query)) {
            query = e.value;
            if (input.value !== e.value.search) input.value = e.value.search;
          }
        }
      }
      if (u.docChanged || u.selectionSet) refresh();
    },
  };
}

function isFindChord(e: KeyboardEvent): boolean {
  return (e.key === 'f' || e.key === 'F') && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

function toggleFind(view: EditorView): boolean {
  return searchPanelOpen(view.state) ? closeSearchPanel(view) : openSearchPanel(view);
}

const findOverlay: Extension = search({ top: true, createPanel: createFindPanel });

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type CodeEditorProps = {
  lang: Lang;
  value: string;
  onChange: (value: string) => void;
  breakpoints: Set<number>;
  onToggleBreakpoint: (line: number) => void;
  stoppedLine: number | null;
  /**
   * Bumped on each debugger stop and each in-document stack-frame selection,
   * including when the line number did not change.
   */
  revealSeq: number;
  /** Flash the line only for a debugger stop, not a stack-frame selection. */
  revealFlash: boolean;
};

export default function CodeEditor(props: CodeEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const breakpointsEnabled = LANGS[props.lang].debug;

  const toggleRef = useRef(props.onToggleBreakpoint);
  toggleRef.current = props.onToggleBreakpoint;

  const extensions = useMemo<Extension[]>(
    () => [
      LANG_EXTENSIONS[props.lang](),
      breakpointsField,
      stoppedLineField,
      stoppedLineHighlight,
      makeLineGutter(toggleRef, breakpointsEnabled),
      telemetryEditor(),
      syntaxHighlighting(codeSyntax),
      findOverlay,
      editorChrome,
    ],
    [props.lang, breakpointsEnabled],
  );

  // App-wide find: while this editor pane is visible, ⌘/Ctrl+F always toggles
  // our overlay — even when focus is in the terminal, variables, etc.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isFindChord(e)) return;
      const view = cmRef.current?.view;
      if (!view || view.dom.closest('[hidden]')) return;
      e.preventDefault();
      e.stopPropagation();
      toggleFind(view);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // React → CM sync. Include lang/value so we don't apply line state mid-switch.
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    const maxLine = view.state.doc.lines;
    const breakpoints = Array.from(props.breakpoints).filter(
      (ln) => ln >= 1 && ln <= maxLine,
    );
    const stoppedLine =
      props.stoppedLine != null &&
      props.stoppedLine >= 1 &&
      props.stoppedLine <= maxLine
        ? props.stoppedLine
        : null;
    // Keep an in-progress flash when this effect re-runs for an unrelated
    // editor update (breakpoints, typing) on the same line.
    const current = view.state.field(stoppedLineField);
    const flash = current.line === stoppedLine ? current.flash : 0;
    view.dispatch({
      effects: [
        setBreakpointsEffect.of(breakpoints),
        setStoppedLineEffect.of(stopHighlight(stoppedLine, flash)),
      ],
    });
  }, [props.lang, props.value, props.breakpoints, props.stoppedLine]);

  // Scroll after the highlight is applied. A new `revealSeq` repeats the scroll
  // even when the line number did not change. The flash plays only for stops.
  useEffect(() => {
    if (props.revealSeq === 0 || props.stoppedLine == null) return;
    const line = props.stoppedLine;
    const flash = props.revealFlash ? props.revealSeq : 0;
    let cancelled = false;
    let cancelScroll = () => {};
    let flashFrame = 0;

    const afterScroll = () => {
      if (cancelled || flash === 0) return;
      const current = cmRef.current?.view;
      if (!current) return;
      if (line < 1 || line > current.state.doc.lines) return;
      // Drop the class for a frame so the animation restarts.
      current.dispatch({ effects: setStoppedLineEffect.of(stopHighlight(line, 0)) });
      flashFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        const view = cmRef.current?.view;
        if (!view || line < 1 || line > view.state.doc.lines) return;
        view.dispatch({ effects: setStoppedLineEffect.of(stopHighlight(line, flash)) });
      });
    };

    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      const view = cmRef.current?.view;
      if (!view) return;
      cancelScroll = scrollLineIntoView(view, line, afterScroll);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(flashFrame);
      cancelScroll();
    };
  }, [props.revealSeq, props.revealFlash, props.stoppedLine]);

  return (
    <CodeMirror
      key={props.lang}
      ref={cmRef}
      value={props.value}
      onChange={props.onChange}
      extensions={extensions}
      // We own every visual style above (chrome + syntax) — no @uiw defaults.
      theme="none"
      basicSetup={{
        // We render our own combined breakpoint + line-number gutter.
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
      style={{ height: '100%', flex: 1, minWidth: 0, overflow: 'hidden' }}
    />
  );
}
