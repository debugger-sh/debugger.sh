export type PaneId = 'editor' | 'variables' | 'output' | 'tests';

export const PANE_IDS: readonly PaneId[] = ['editor', 'variables', 'output', 'tests'];

export const PANE_LABELS: Record<PaneId, string> = {
  editor: 'Code',
  variables: 'Variables',
  output: 'Terminal',
  tests: 'Tests',
};

export type SplitDir = 'h' | 'v';
export type DropEdge = 'center' | 'left' | 'right' | 'top' | 'bottom';

export type TabGroup = {
  type: 'tabs';
  id: string;
  tabs: PaneId[];
  active: PaneId;
};

export type SplitNode = {
  type: 'split';
  id: string;
  dir: SplitDir;
  children: [DockNode, DockNode];
  sizes: [number, number];
};

export type DockNode = TabGroup | SplitNode;

export type DockState = {
  root: DockNode;
};

let nextId = 1;
export function newId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function defaultDockState(): DockState {
  return {
    root: {
      type: 'split',
      id: 'split-root',
      dir: 'h',
      sizes: [62, 38],
      children: [
        { type: 'tabs', id: 'tabs-main', tabs: ['editor'], active: 'editor' },
        {
          type: 'split',
          id: 'split-right',
          dir: 'v',
          sizes: [52, 48],
          children: [
            { type: 'tabs', id: 'tabs-side', tabs: ['variables'], active: 'variables' },
            {
              type: 'tabs',
              id: 'tabs-bottom',
              tabs: ['output', 'tests'],
              active: 'tests',
            },
          ],
        },
      ],
    },
  };
}

export function isTabGroup(n: DockNode): n is TabGroup {
  return n.type === 'tabs';
}

export function isSplitNode(n: DockNode): n is SplitNode {
  return n.type === 'split';
}

/** Walk the tree and collect every tab group. */
export function collectGroups(node: DockNode, out: TabGroup[] = []): TabGroup[] {
  if (isTabGroup(node)) {
    out.push(node);
    return out;
  }
  collectGroups(node.children[0], out);
  collectGroups(node.children[1], out);
  return out;
}

export function findGroup(node: DockNode, groupId: string): TabGroup | null {
  if (isTabGroup(node)) return node.id === groupId ? node : null;
  return findGroup(node.children[0], groupId) ?? findGroup(node.children[1], groupId);
}

export function visiblePanes(state: DockState): Set<PaneId> {
  const set = new Set<PaneId>();
  for (const g of collectGroups(state.root)) {
    for (const t of g.tabs) set.add(t);
  }
  return set;
}

export function closedPanes(state: DockState): PaneId[] {
  const vis = visiblePanes(state);
  return PANE_IDS.filter((p) => !vis.has(p));
}
