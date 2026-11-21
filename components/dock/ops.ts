import {
  type DockNode,
  type DockState,
  type DropEdge,
  type PaneId,
  type SplitDir,
  type TabGroup,
  collectGroups,
  isSplitNode,
  isTabGroup,
  newId,
  visiblePanes,
} from './types';

function mapNode(node: DockNode, fn: (n: DockNode) => DockNode): DockNode {
  const next = fn(node);
  if (next !== node) return next;
  if (!isSplitNode(node)) return node;
  const a = mapNode(node.children[0], fn);
  const b = mapNode(node.children[1], fn);
  if (a === node.children[0] && b === node.children[1]) return node;
  return { ...node, children: [a, b] };
}

function updateGroup(
  state: DockState,
  groupId: string,
  update: (g: TabGroup) => TabGroup | null,
): DockState {
  const root = mapNode(state.root, (n) => {
    if (!isTabGroup(n) || n.id !== groupId) return n;
    const next = update(n);
    // An empty group is pruned below.
    return next ?? { ...n, tabs: [] };
  });
  return pruneEmpty({ root });
}

/** Remove a pane from wherever it currently lives. Returns whether it was the last visible pane. */
function detachPane(state: DockState, pane: PaneId): { state: DockState; blocked: boolean } {
  const vis = visiblePanes(state);
  if (vis.size <= 1 && vis.has(pane)) return { state, blocked: true };

  const root = mapNode(state.root, (n) => {
    if (!isTabGroup(n) || !n.tabs.includes(pane)) return n;
    const tabs = n.tabs.filter((t) => t !== pane);
    if (tabs.length === 0) return { ...n, tabs };
    const active = n.active === pane ? tabs[tabs.length - 1]! : n.active;
    return { ...n, tabs, active };
  });
  return { state: pruneEmpty({ root }), blocked: false };
}

/** Collapse empty tab groups by promoting the sibling. */
function pruneEmpty(state: DockState): DockState {
  const prune = (node: DockNode): DockNode | null => {
    if (isTabGroup(node)) return node.tabs.length === 0 ? null : node;
    const a = prune(node.children[0]);
    const b = prune(node.children[1]);
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    if (a === node.children[0] && b === node.children[1]) return node;
    return { ...node, children: [a, b] };
  };
  const next = prune(state.root);
  // Should never empty the whole tree if invariants held; fall back safely.
  if (!next) return state;
  return next === state.root ? state : { root: next };
}

export function setActive(state: DockState, groupId: string, pane: PaneId): DockState {
  return updateGroup(state, groupId, (g) => {
    if (!g.tabs.includes(pane)) return g;
    return { ...g, active: pane };
  });
}

export function setSplitSizes(
  state: DockState,
  splitId: string,
  sizes: [number, number],
): DockState {
  const root = mapNode(state.root, (n) => {
    if (!isSplitNode(n) || n.id !== splitId) return n;
    if (n.sizes[0] === sizes[0] && n.sizes[1] === sizes[1]) return n;
    return { ...n, sizes };
  });
  return root === state.root ? state : { root };
}

export function closeTab(state: DockState, groupId: string, pane: PaneId): DockState {
  const group = collectGroups(state.root).find((g) => g.id === groupId);
  if (!group || !group.tabs.includes(pane)) return state;
  return detachPane(state, pane).state;
}

export function openInGroup(state: DockState, groupId: string, pane: PaneId): DockState {
  if (visiblePanes(state).has(pane)) {
    // Already open — just activate wherever it is.
    for (const g of collectGroups(state.root)) {
      if (g.tabs.includes(pane)) return setActive(state, g.id, pane);
    }
    return state;
  }
  return updateGroup(state, groupId, (g) => ({
    ...g,
    tabs: [...g.tabs, pane],
    active: pane,
  }));
}

/** Move a pane into a target group (optionally at index). */
export function moveToGroup(
  state: DockState,
  pane: PaneId,
  targetGroupId: string,
  index?: number,
): DockState {
  const target = collectGroups(state.root).find((g) => g.id === targetGroupId);
  if (!target) return state;

  // Same group reorder
  if (target.tabs.includes(pane)) {
    return updateGroup(state, targetGroupId, (g) => {
      const without = g.tabs.filter((t) => t !== pane);
      const i = index == null ? without.length : Math.max(0, Math.min(index, without.length));
      const tabs = [...without.slice(0, i), pane, ...without.slice(i)];
      return { ...g, tabs, active: pane };
    });
  }

  const detached = detachPane(state, pane);
  if (detached.blocked) return state;

  return updateGroup(detached.state, targetGroupId, (g) => {
    const i = index == null ? g.tabs.length : Math.max(0, Math.min(index, g.tabs.length));
    const tabs = [...g.tabs.slice(0, i), pane, ...g.tabs.slice(i)];
    return { ...g, tabs, active: pane };
  });
}

const EDGE_SPLITS: Record<Exclude<DropEdge, 'center'>, { dir: SplitDir; first: boolean }> = {
  left: { dir: 'h', first: true },
  right: { dir: 'h', first: false },
  top: { dir: 'v', first: true },
  bottom: { dir: 'v', first: false },
};

/** Split a leaf group, placing `pane` in the new sibling. */
export function splitLeaf(
  state: DockState,
  targetGroupId: string,
  pane: PaneId,
  edge: DropEdge,
): DockState {
  if (edge === 'center') return moveToGroup(state, pane, targetGroupId);
  const splitInfo = EDGE_SPLITS[edge];

  const target = collectGroups(state.root).find((g) => g.id === targetGroupId);
  if (!target) return state;

  // Splitting a group around its only tab is a no-op. Otherwise the target keeps
  // at least one tab, so it survives the detach.
  if (target.tabs.length === 1 && target.tabs[0] === pane) return state;

  const detached = detachPane(state, pane);
  if (detached.blocked) return state;

  const newGroup: TabGroup = {
    type: 'tabs',
    id: newId('tabs'),
    tabs: [pane],
    active: pane,
  };

  const root = mapNode(detached.state.root, (n) => {
    if (!isTabGroup(n) || n.id !== targetGroupId) return n;
    const children: [DockNode, DockNode] = splitInfo.first ? [newGroup, n] : [n, newGroup];
    return {
      type: 'split' as const,
      id: newId('split'),
      dir: splitInfo.dir,
      sizes: [50, 50] as [number, number],
      children,
    };
  });

  return pruneEmpty({ root });
}

/** Resolve which edge of a rect the pointer is over. */
export function hitEdge(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  band = 0.22,
): DropEdge {
  const fromLeft = (clientX - rect.left) / rect.width;
  const fromTop = (clientY - rect.top) / rect.height;
  const fromRight = 1 - fromLeft;
  const fromBottom = 1 - fromTop;
  const min = Math.min(fromLeft, fromRight, fromTop, fromBottom);
  if (min > band) return 'center';
  if (min === fromLeft) return 'left';
  if (min === fromRight) return 'right';
  if (min === fromTop) return 'top';
  return 'bottom';
}
