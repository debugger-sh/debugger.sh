/**
 * Isolated Stanford collection pretty-printers for the Variables panel.
 * Works against raw DAP variables (no web-ide plugin system).
 *
 * Keep this file self-contained — do not import IDE UI or execution hooks.
 */

import type { DapVariable } from '@/components/dap-types';

type ADT = 'Vector' | 'Grid' | 'Map' | 'Set' | 'Stack' | 'Queue' | 'Deque' | 'PriorityQueue';

type TemplateType = { name: string; arguments: string[] };

const SET_NAMESPACE = 'stanfordcpplib::collections::';

function templateType(type: string): TemplateType | undefined {
  if (type.length > 8_192) return undefined;
  const text = type
    .trim()
    .replace(/^(?:const\s+|volatile\s+)+/u, '')
    .replace(/^::/u, '')
    .replace(/\s+(?:const|volatile)$/u, '');
  const start = text.indexOf('<');
  if (start <= 0) return undefined;
  const name = text.slice(0, start).trim();
  if (!/^[a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*$/u.test(name)) return undefined;
  const args: string[] = [];
  let depth = 0;
  let argumentStart = start + 1;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === '<') {
      depth += 1;
      if (depth > 32) return undefined;
    } else if (character === '>') {
      depth -= 1;
      if (depth === 0) {
        if (text.slice(index + 1).trim()) return undefined;
        args.push(text.slice(argumentStart, index).trim());
        return args.every(Boolean) ? { name, arguments: args } : undefined;
      }
    } else if (character === ',' && depth === 1) {
      args.push(text.slice(argumentStart, index).trim());
      argumentStart = index + 1;
      if (args.length > 8) return undefined;
    }
  }
  return undefined;
}

function identify(type: string | undefined): ADT | undefined {
  if (!type) return undefined;
  const parsed = templateType(type.replace(/\s*&&?\s*$/u, ''));
  if (!parsed) return undefined;
  if (parsed.name === 'Map' && parsed.arguments.length === 2) return 'Map';
  if (parsed.arguments.length !== 1) return undefined;
  if (['Vector', 'Grid', 'Set', 'Stack', 'Queue', 'Deque', 'PriorityQueue'].includes(parsed.name)) {
    return parsed.name as ADT;
  }
  if (parsed.name === `${SET_NAMESPACE}GenericSet`) {
    const traits = templateType(parsed.arguments[0] ?? '');
    if (traits?.name === `${SET_NAMESPACE}SetTraits` && traits.arguments.length === 1) return 'Set';
  }
  return undefined;
}

function field(children: DapVariable[], name: string): DapVariable | undefined {
  return children.find((child) => child.name === name);
}

function summaryFor(adt: ADT, backingCount: number | undefined, shape?: { rows: number; columns: number }): string {
  if (shape) return `Grid · ${shape.rows} × ${shape.columns}`;
  if (adt === 'Stack') return `Stack · ${backingCount ?? '?'} (bottom → top)`;
  if (adt === 'Queue' || adt === 'Deque') return `${adt} · ${backingCount ?? '?'} (front → back)`;
  if (adt === 'PriorityQueue') return `PriorityQueue · ${backingCount ?? '?'}`;
  if (backingCount !== undefined) return `${adt} · ${backingCount}`;
  return adt;
}

function parseCount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!/^\+?\d+$/u.test(text)) return undefined;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

export type StanfordPresentation = {
  summary: string;
  /** Logical children to show instead of raw struct members. */
  children: DapVariable[];
};

/** Cheap type-name check — does not touch DAP. */
export function stanfordCollectionName(type: string | undefined): string | null {
  return identify(type) ?? null;
}

/**
 * If `variable` is a Stanford collection, return a prettier summary + children.
 * `expand` must perform a synchronous DAP `variables` request.
 */
export function presentStanfordVariable(
  variable: DapVariable,
  expand: (variablesReference: number) => DapVariable[],
): StanfordPresentation | null {
  const adt = identify(variable.type);
  if (!adt || variable.variablesReference <= 0) return null;

  try {
    const members = expand(variable.variablesReference);

    if (adt === 'Map' || adt === 'Set') {
      let mapVar = variable;
      let mapMembers = members;
      if (adt === 'Set') {
        const backingMap = field(members, '_map');
        if (!backingMap || backingMap.variablesReference <= 0) return null;
        mapVar = backingMap;
        mapMembers = expand(backingMap.variablesReference);
      }
      const elements = field(mapMembers, '_elements');
      if (!elements || elements.variablesReference <= 0) {
        return { summary: summaryFor(adt, undefined), children: members };
      }
      const entries = expand(elements.variablesReference);
      const children: DapVariable[] = [];
      for (const [index, entry] of entries.entries()) {
        if (entry.variablesReference <= 0) {
          children.push({ ...entry, name: `[${index}]` });
          continue;
        }
        const fields = expand(entry.variablesReference);
        const key = field(fields, 'first');
        const value = field(fields, 'second');
        if (adt === 'Set' && key) {
          children.push({ ...key, name: `[${index}]` });
        } else if (key && value) {
          children.push({
            ...value,
            name: `[${index}]`,
            value: `${key.value} → ${value.value}`,
          });
        } else {
          children.push({ ...entry, name: `[${index}]` });
        }
      }
      void mapVar;
      return {
        summary: summaryFor(adt, parseCount(elements.value) ?? children.length),
        children,
      };
    }

    let shape: { rows: number; columns: number } | undefined;
    let sequence: DapVariable | undefined;

    if (adt === 'Grid') {
      const elements = field(members, '_elements');
      const rows = field(members, '_rowCount');
      const columns = field(members, '_columnCount');
      const rowCount = parseCount(rows?.value);
      const columnCount = parseCount(columns?.value);
      if (rowCount !== undefined && columnCount !== undefined) shape = { rows: rowCount, columns: columnCount };
      if (elements && elements.variablesReference > 0) {
        const vectorMembers = expand(elements.variablesReference);
        sequence = field(vectorMembers, '_elements') ?? elements;
      }
    } else if (adt === 'Vector' || adt === 'Deque') {
      sequence = field(members, '_elements');
    } else if (adt === 'PriorityQueue') {
      const heap = field(members, '_heap');
      if (heap && heap.variablesReference > 0) {
        const heapMembers = expand(heap.variablesReference);
        sequence = field(heapMembers, '_elements') ?? heap;
      }
    } else {
      // Stack / Queue
      const elements = field(members, '_elements');
      if (elements && elements.variablesReference > 0) {
        const inner = expand(elements.variablesReference);
        sequence = field(inner, '_elements') ?? elements;
      }
    }

    if (!sequence || sequence.variablesReference <= 0) {
      return { summary: summaryFor(adt, undefined, shape), children: members };
    }

    const elements = expand(sequence.variablesReference);
    const total = parseCount(sequence.value) ?? elements.length;
    const children = elements.map((element, offset) => {
      const index = offset;
      let name =
        shape && shape.columns > 0
          ? `[${Math.floor(index / shape.columns)}, ${index % shape.columns}]`
          : `[${index}]`;
      if (adt === 'Stack' && index === total - 1) name += ' · top';
      if ((adt === 'Queue' || adt === 'Deque') && index === 0) name += ' · front';
      if (adt === 'Deque' && index === total - 1) name += ' · back';
      if (adt === 'PriorityQueue' && index === 0) name += ' · next';
      return { ...element, name };
    });

    return { summary: summaryFor(adt, total, shape), children };
  } catch {
    return null;
  }
}
