'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Group, Panel, Separator } from 'react-resizable-panels';

import './dock.css';

export type PaneId = 'editor' | 'variables' | 'output';

type ZoneId = 'main' | 'side' | 'panel';

const PANE_LABELS: Record<PaneId, string> = {
  editor: 'source',
  variables: 'variables',
  output: 'terminal',
};

const ZONES: ZoneId[] = ['main', 'side', 'panel'];

/** Which pane lives in each dock region (VS Code–style: main | right strip | bottom panel). */
type Placement = Record<ZoneId, PaneId>;

const DEFAULT_PLACEMENT: Placement = {
  main: 'editor',
  side: 'variables',
  panel: 'output',
};

const PLACEMENT_KEY = 'ide-dock-placement-v2';

function isValidPlacement(x: unknown): x is Placement {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const seen = new Set<PaneId>();
  for (const z of ZONES) {
    const p = o[z];
    if (p !== 'editor' && p !== 'variables' && p !== 'output') return false;
    if (seen.has(p)) return false;
    seen.add(p);
  }
  return seen.size === 3;
}

function swapZones(p: Placement, a: ZoneId, b: ZoneId): Placement {
  if (a === b) return p;
  const next = { ...p };
  const t = next[a];
  next[a] = next[b];
  next[b] = t;
  return next;
}

function persistPlacement(p: Placement) {
  try {
    localStorage.setItem(PLACEMENT_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** One docked “window”: title bar drags to swap zones; body fills the panel cell. */
function DockZone({
  zone,
  pane,
  actions,
  children,
}: {
  zone: ZoneId;
  pane: PaneId;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${zone}`,
    data: { zone },
  });

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag-${zone}`,
    data: { zone },
  });

  return (
    <div
      ref={setDropRef}
      className="ide-dock-zone"
      data-drop-highlight={isOver ? 'true' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        background: '#0d0d0d',
        overflow: 'hidden',
      }}
    >
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        className="ide-dock-zone-title"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxSizing: 'border-box',
          minHeight: 28,
          padding: '0 10px',
          background: '#0d0d0d',
          borderBottom: '1px solid #1a1a1a',
          fontSize: 10,
          letterSpacing: 1.4,
          fontWeight: 600,
          lineHeight: '10px',
          textTransform: 'uppercase',
          color: '#888',
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
          opacity: isDragging ? 0.45 : 1,
          transition: 'opacity 0.18s ease',
        }}
      >
        <span style={{ color: '#555', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center' }} aria-hidden>
          ⠿
        </span>
        {PANE_LABELS[pane]}
        {actions && (
          <>
            <div style={{ flex: 1 }} />
            <div
              // Stop drag activation when interacting with actions; the title bar
              // owns dnd-kit's pointerdown listener.
              onPointerDown={(e) => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'auto' }}
            >
              {actions}
            </div>
          </>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export type ResizableWorkspaceProps = {
  panes: Record<PaneId, ReactNode>;
  /** Optional action slot rendered on the right of each pane's title bar. */
  paneActions?: Partial<Record<PaneId, ReactNode>>;
};

/**
 * VS Code–style dock: main (left) | side (right) on top, full-width panel on bottom.
 * Drag a pane’s title onto another zone to swap. Resize with the splitters.
 */
export default function ResizableWorkspace({ panes, paneActions }: ResizableWorkspaceProps) {
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT);
  const [dragZone, setDragZone] = useState<ZoneId | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLACEMENT_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isValidPlacement(parsed)) setPlacement(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const onDragStart = useCallback((e: DragStartEvent) => {
    const z = e.active.data.current?.zone as ZoneId | undefined;
    setDragZone(z ?? null);
  }, []);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setDragZone(null);
    const { active, over } = e;
    if (!over) return;
    const from = active.data.current?.zone as ZoneId | undefined;
    const to = over.data.current?.zone as ZoneId | undefined;
    if (!from || !to || from === to) return;
    setPlacement((p) => {
      const next = swapZones(p, from, to);
      persistPlacement(next);
      return next;
    });
  }, []);

  const onDragCancel = useCallback(() => setDragZone(null), []);

  const draggedPane = dragZone ? placement[dragZone] : null;

  return (
    <DndContext
      // Stable id so a11y `aria-describedby` does not rely on a module-level
      // counter that diverges between SSR and the client (hydration mismatch).
      id="ide-resizable-workspace"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #1a1a1a',
          borderRadius: 4,
          overflow: 'hidden',
          background: '#080808',
        }}
      >
        <Group
          id="ide-dock-vertical"
          orientation="vertical"
          style={{ flex: 1, minHeight: 0, minWidth: 0, height: '100%' }}
        >
          <Panel id="top" minSize="18%" defaultSize="70%">
            <Group
              id="ide-dock-horizontal"
              orientation="horizontal"
              style={{ height: '100%', minHeight: 0, width: '100%' }}
            >
              <Panel id="main" minSize="28%" defaultSize="73%">
                <DockZone zone="main" pane={placement.main} actions={paneActions?.[placement.main]}>
                  {panes[placement.main]}
                </DockZone>
              </Panel>
              <Separator id="sep-main-side" style={{ width: 5 }} />
              <Panel id="side" minSize="18%" defaultSize="27%">
                <DockZone zone="side" pane={placement.side} actions={paneActions?.[placement.side]}>
                  {panes[placement.side]}
                </DockZone>
              </Panel>
            </Group>
          </Panel>
          <Separator id="sep-top-panel" style={{ height: 5 }} />
          <Panel id="bottom" minSize="14%" defaultSize="30%">
            <DockZone zone="panel" pane={placement.panel} actions={paneActions?.[placement.panel]}>
              {panes[placement.panel]}
            </DockZone>
          </Panel>
        </Group>
      </div>

      <DragOverlay
        style={{ cursor: 'grabbing' }}
        dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {draggedPane ? (
          <div
            style={{
              padding: '8px 14px',
              background: '#1a1a1a',
              border: '1px solid rgba(59, 130, 246, 0.55)',
              borderRadius: 6,
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: '#a5b4fc',
              boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
            }}
          >
            {PANE_LABELS[draggedPane]}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
