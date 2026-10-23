// Dragging (DS-49, DS-27, DS-21): one dnd-kit context for the workspace, so a drag that starts in a view can end on
// the sidebar tree. Under Manual sort, a row's handle drags it among its view's rows, a line showing where it would
// land; a drop rearranges (TS-16). A folder or list, dragged from its row or the tree, moves when dropped onto a
// folder in the tree or onto Collection, which highlight while it is over them (FR-01.4, FR-01.5). Pointer only:
// the keyboard rearranges with ⌥↑ / ⌥↓ and moves with M. Only rows in view can be targets, since the rest are not
// drawn; the overlay keeps the dragged item's name in sight as the view scrolls.

import { useConnection } from "@/features/sync/sync-provider";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useMode } from "./collection-ui";
import { useCollectionData } from "./data";
import { useMoveContainer } from "./move";
import { canMoveInto } from "./tree";
import type { ViewMoves } from "./use-rearrange";

/** What is dragged: an album or a folder or list, from a view's row (`viewKey`) or the tree (no `viewKey`). */
export type DragItem = {
  kind: "album" | "container";
  id: string;
  name: string;
  viewKey: string | undefined;
};

type RowTarget = { type: "row"; viewKey: string; itemId: string };
type DestinationTarget = { type: "destination"; parentId: string | null };

const isDragItem = (data: unknown): data is DragItem =>
  typeof data === "object" && data !== null && "kind" in data && "id" in data && "name" in data;
const isRow = (data: unknown): data is RowTarget =>
  typeof data === "object" && data !== null && "type" in data && data.type === "row";
const isDestination = (data: unknown): data is DestinationTarget =>
  typeof data === "object" && data !== null && "type" in data && data.type === "destination";

type Indicator = { itemId: string; side: "before" | "after" };

type DragState = {
  active: DragItem | undefined;
  /** Where the dragged row would land: before or after the row of `itemId`. */
  indicator: Indicator | undefined;
  /** Registers how the view `viewKey` takes a drop among its rows; answers the unregister function. */
  registerDrop: (viewKey: string, drop: ViewMoves["drop"]) => () => void;
};

const DragContext = createContext<DragState>({
  active: undefined,
  indicator: undefined,
  registerDrop: () => () => {},
});

/** Where an element is drawn, transforms included. */
function placeOf(element: HTMLElement) {
  const { top, left, width, height, bottom, right } = element.getBoundingClientRect();
  return { top, left, width, height, bottom, right };
}

/** The row a drag is over, and which half of it the pointer is in. */
function rowTargetOf(event: DragMoveEvent | DragEndEvent): (RowTarget & Indicator) | undefined {
  const { over, activatorEvent, delta } = event;
  const data = over?.data.current;
  if (!over || !isRow(data)) return undefined;
  const startY =
    activatorEvent && "clientY" in activatorEvent && typeof activatorEvent.clientY === "number"
      ? activatorEvent.clientY
      : undefined;
  if (startY === undefined) return undefined;
  const side = startY + delta.y < over.rect.top + over.rect.height / 2 ? "before" : "after";
  return { ...data, side };
}

export function DragProvider({ children }: { children: ReactNode }) {
  // A press that moves less than 6 px is still a click, so links and buttons keep working.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [active, setActive] = useState<DragItem | undefined>(undefined);
  const [indicator, setIndicator] = useState<Indicator | undefined>(undefined);
  const drops = useRef(new Map<string, ViewMoves["drop"]>());
  const move = useMoveContainer();
  const { enterEditing } = useMode();

  const registerDrop = useCallback((viewKey: string, drop: ViewMoves["drop"]) => {
    drops.current.set(viewKey, drop);
    return () => {
      if (drops.current.get(viewKey) === drop) drops.current.delete(viewKey);
    };
  }, []);

  const end = () => {
    setActive(undefined);
    setIndicator(undefined);
  };

  const state = useMemo<DragState>(
    () => ({ active, indicator, registerDrop }),
    [active, indicator, registerDrop],
  );

  return (
    <DragContext value={state}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        // Virtual rows are placed by a transform, which dnd-kit leaves out of its measures by default; and they move
        // as the view re-sorts, so they are measured afresh while dragging.
        measuring={{
          draggable: { measure: placeOf },
          dragOverlay: { measure: placeOf },
          droppable: { strategy: MeasuringStrategy.Always, measure: placeOf },
        }}
        // The views announce the moves themselves (DS-83).
        accessibility={{
          announcements: {
            onDragStart: () => undefined,
            onDragOver: () => undefined,
            onDragEnd: () => undefined,
            onDragCancel: () => undefined,
          },
          screenReaderInstructions: { draggable: "" },
        }}
        onDragStart={({ active: started }) => {
          const data = started.data.current;
          if (isDragItem(data)) setActive(data);
        }}
        onDragMove={(event) => {
          const target = rowTargetOf(event);
          const next =
            target && active && target.viewKey === active.viewKey && target.itemId !== active.id
              ? { itemId: target.itemId, side: target.side }
              : undefined;
          setIndicator((current) =>
            current?.itemId === next?.itemId && current?.side === next?.side ? current : next,
          );
        }}
        onDragEnd={(event) => {
          const item = event.active.data.current;
          const over = event.over?.data.current;
          end();
          if (!isDragItem(item)) return;
          if (isDestination(over)) {
            // A move is an edit: it switches to Editing first (DS-45, decided 23 October 2026).
            if (item.kind === "container") {
              enterEditing();
              move(item.id, over.parentId);
            }
            return;
          }
          const target = rowTargetOf(event);
          if (!target || item.viewKey === undefined || target.viewKey !== item.viewKey) return;
          const place =
            target.side === "before" ? { before: target.itemId } : { after: target.itemId };
          drops.current.get(item.viewKey)?.(item.id, place);
        }}
        onDragCancel={end}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {active && (
            <div className="inline-flex max-w-72 items-center rounded-md bg-raised px-3 py-1.5 text-fg-primary shadow-floating">
              <span className="truncate">{active.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragContext>
  );
}

/** Lets drops among the view's rows rearrange it. */
export function useDropHandler(viewKey: string, drop: ViewMoves["drop"]): void {
  const { registerDrop } = useContext(DragContext);
  useEffect(() => registerDrop(viewKey, drop), [registerDrop, viewKey, drop]);
}

/**
 * A view's row as a drag source, by its handle, and a drop target among its siblings, under Manual sort. Answers
 * the row's ref, the handle's props, whether it is being dragged, and where a drop would land beside it.
 */
export function useRowDrag(item: DragItem & { viewKey: string }, enabled: boolean) {
  const { indicator } = useContext(DragContext);
  const drop = useDroppable({
    id: `row:${item.viewKey}:${item.id}`,
    data: { type: "row", viewKey: item.viewKey, itemId: item.id } satisfies RowTarget,
    disabled: !enabled,
  });
  const drag = useDraggable({
    id: `row-item:${item.viewKey}:${item.id}`,
    data: item,
    disabled: !enabled,
  });
  const { setNodeRef: setDropRef } = drop;
  const { setNodeRef: setDragRef } = drag;
  const ref = useCallback(
    (element: HTMLElement | null) => {
      setDropRef(element);
      setDragRef(element);
    },
    [setDropRef, setDragRef],
  );
  return {
    ref,
    handle: { ref: drag.setActivatorNodeRef, ...drag.listeners },
    dragging: drag.isDragging,
    side: indicator?.itemId === item.id ? indicator.side : undefined,
  };
}

/** A folder or list in the tree, as a drag source for moves. Its own keys stay the tree's. */
export function useTreeDrag(item: { id: string; name: string }) {
  const drag = useDraggable({
    id: `tree:${item.id}`,
    data: {
      kind: "container",
      id: item.id,
      name: item.name,
      viewKey: undefined,
    } satisfies DragItem,
  });
  return { setNodeRef: drag.setNodeRef, listeners: drag.listeners, dragging: drag.isDragging };
}

/**
 * A place in the tree that takes a dragged folder or list: a folder, or Collection for the root (`parentId` null).
 * It takes only what can move there, and nothing while offline (DS-81). A list is no place (`enabled` false).
 */
export function useDestination(parentId: string | null, enabled = true) {
  const { tree } = useCollectionData();
  const offline = useConnection() === "offline";
  const { active } = useDndContext();
  const item = active?.data.current;
  const accepts =
    enabled &&
    !offline &&
    isDragItem(item) &&
    item.kind === "container" &&
    canMoveInto(tree, item.id, parentId);
  const drop = useDroppable({
    id: `destination:${parentId ?? "root"}`,
    data: { type: "destination", parentId } satisfies DestinationTarget,
    disabled: !accepts,
  });
  return { setNodeRef: drop.setNodeRef, over: accepts && drop.isOver };
}
