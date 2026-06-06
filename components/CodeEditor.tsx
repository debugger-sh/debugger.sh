'use client';

import { useEffect, useMemo, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { Decoration, EditorView, gutter, GutterMarker } from '@codemirror/view';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

import type { Lang } from '@/components/constants';


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
  constructor(readonly lineNumber: number, readonly hasBreakpoint: boolean) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return (
      other instanceof LineGutterMarker &&
      other.lineNumber === this.lineNumber &&
      other.hasBreakpoint === this.hasBreakpoint
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
      return new LineGutterMarker(lineNumber, hasBreakpoint);
    },
    lineMarkerChange: (update) =>
      update.docChanged ||
      update.startState.field(breakpointsField) !== update.state.field(breakpointsField),
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

const setStoppedLineEffect = StateEffect.define<number | null>();

const stoppedLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setStoppedLineEffect)) value = e.value;
    return value;
  },
});

const stoppedLineHighlight = EditorView.decorations.compute([stoppedLineField], (state) => {
  const ln = state.field(stoppedLineField);
  if (ln == null || ln < 1 || ln > state.doc.lines) return Decoration.none;
  return Decoration.set([
    Decoration.line({ attributes: { class: 'cm-stopped-line' } }).range(state.doc.line(ln).from),
  ]);
});

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
};

export default function CodeEditor(props: CodeEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const breakpointsEnabled = props.lang === 'c';

  const toggleRef = useRef(props.onToggleBreakpoint);
  toggleRef.current = props.onToggleBreakpoint;

  const extensions = useMemo<Extension[]>(
    () => [
      props.lang === 'python' ? python() : cpp(),
      breakpointsField,
      stoppedLineField,
      stoppedLineHighlight,
      makeLineGutter(toggleRef, breakpointsEnabled),
      syntaxHighlighting(codeSyntax),
      editorChrome,
    ],
    [props.lang, breakpointsEnabled],
  );

  // React → CM sync: re-dispatch whenever the React state changes.
  useEffect(() => {
    cmRef.current?.view?.dispatch({
      effects: setBreakpointsEffect.of(Array.from(props.breakpoints)),
    });
  }, [props.breakpoints]);

  useEffect(() => {
    cmRef.current?.view?.dispatch({
      effects: setStoppedLineEffect.of(props.stoppedLine),
    });
  }, [props.stoppedLine]);

  return (
    <CodeMirror
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
