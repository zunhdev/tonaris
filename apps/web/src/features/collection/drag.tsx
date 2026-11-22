// Dragging (DS-49, DS-27, DS-21): one dnd-kit context for the workspace, so a drag that starts in a view can end on the
// sidebar tree. Under Manual sort, a row's handle drags it among its view's rows, a line showing where it would land; a
// drop rearranges (TS-16). A card has no handle: it drags itself, among its view's cards, landing left or right of the
// card under the pointer, the gap around each card counting as the card while a drag lasts (TON-322). A folder or list,
// dragged from its row, its card or the tree, moves when dropped onto a folder in the tree or onto Collection, which
// highlight while it is over them (FR-01.4, FR-01.5). Pointer only: the keyboard rearranges with ⌥↑ / ⌥↓ and moves with
// M. Only rows and cards in view can be targets, since the rest are not drawn; the overlay keeps the dragged item's
// name in sight as the view scrolls, where the pointer took hold of it, and over a folder it can move into, what the
// move would do to sharing (DS-69, FR-07.14). The target is what is under the pointer on the page as it is, so rows
// that move during a drag are found where they went (TON-302). An album from the person's own list or Unsorted, dropped
// on another of their lists in the tree, joins it; with ⌥ held, from a list, it moves there (TON-229).

import { SharingImpactPreview } from "@/features/sharing/sharing-impact";
import { useConnection } from "@/features/sync/sync-provider";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DraggableNode,
  type DroppableContainer,
  type Modifier,
  type PointerSensorOptions,
} from "@dnd-kit/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useMode } from "./collection-mode";
import { useCollectionData } from "./data";
import { useDropOnList } from "./drop-on-list";
import { useEdgeScroll } from "./edge-scroll";
import { useMoveWithConsent } from "./move";
import { canMoveInto } from "./tree";
import type { ViewMoves } from "./use-rearrange";

/**
 * What is dragged: an album or a folder or list, from a view's row (`viewKey`) or the tree (no `viewKey`). An album
 * from the person's own collection says so (`own`), with the list on view it is in (`listId`), for a drop on a list.
 */
export type DragItem = {
  kind: "album" | "container";
  id: string;
  name: string;
  viewKey: string | undefined;
  own?: boolean;
  listId?: string;
  /** Dragged by a card, held anywhere in it: the name chip sits at the pointer (TON-322). */
  card?: boolean;
};

/**
 * A row or a card, as a place a dragged item of its view lands beside: before or after it, by the half of it the
 * pointer is in, top or bottom for a row (`vertical`), left or right for a card (`horizontal`).
 */
type RowTarget = {
  type: "row";
  viewKey: string;
  itemId: string;
  axis: "vertical" | "horizontal";
};
type DestinationTarget = { type: "destination"; parentId: string | null };
type ListTarget = { type: "list"; listId: string; name: string };

const isDragItem = (data: unknown): data is DragItem =>
  typeof data === "object" && data !== null && "kind" in data && "id" in data && "name" in data;
const isRow = (data: unknown): data is RowTarget =>
  typeof data === "object" && data !== null && "type" in data && data.type === "row";
const isDestination = (data: unknown): data is DestinationTarget =>
  typeof data === "object" && data !== null && "type" in data && data.type === "destination";
const isList = (data: unknown): data is ListTarget =>
  typeof data === "object" && data !== null && "type" in data && data.type === "list";

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

/**
 * The drop target under the pointer, found on the page as it is now (TON-302), with where it is and where the pointer
 * is. dnd-kit's `pointerWithin` reads where it measured each target, which it measures again only as targets come and
 * go or their list scrolls: rows that moved meanwhile, such as a folder re-sorted by a rename saved elsewhere, lit the
 * folder that used to be under the pointer.
 */
const underPointer: CollisionDetection = ({ droppableContainers, pointerCoordinates }) => {
  if (!pointerCoordinates) return [];
  const targets = new Map<Element, DroppableContainer>();
  for (const container of droppableContainers) {
    const node = container.node.current;
    if (node && !targets.has(node)) targets.set(node, container);
  }
  for (const element of document.elementsFromPoint(pointerCoordinates.x, pointerCoordinates.y)) {
    const container = targets.get(element);
    if (container) {
      const place = element.getBoundingClientRect();
      const { x: pointerX, y: pointerY } = pointerCoordinates;
      return [
        {
          id: container.id,
          data: { droppableContainer: container, value: 0, place, pointerX, pointerY },
        },
      ];
    }
  }
  return [];
};

/** The row or card a drag is over, and which half of it the pointer is in, as `underPointer` found them. */
function rowTargetOf(event: DragMoveEvent | DragEndEvent): (RowTarget & Indicator) | undefined {
  const { over, collisions } = event;
  const data = over?.data.current;
  if (!over || !isRow(data)) return undefined;
  const found = collisions?.find((each) => each.id === over.id)?.data;
  const place: unknown = found?.["place"];
  const pointerX: unknown = found?.["pointerX"];
  const pointerY: unknown = found?.["pointerY"];
  if (!(place instanceof DOMRect) || typeof pointerX !== "number" || typeof pointerY !== "number")
    return undefined;
  const before =
    data.axis === "horizontal"
      ? pointerX < place.left + place.width / 2
      : pointerY < place.top + place.height / 2;
  return { ...data, side: before ? "before" : "after" };
}

/** Where in the dragged item the pointer took hold of it, by its press, measured as the press lands (TON-302). */
const grips = new WeakMap<Event, { x: number; y: number }>();

/**
 * A card's grip, whatever part of it was pressed: the chip just right of the pointer and centred on it, where a row's
 * ends up, held by its handle at the row's left. The card's own grip could leave it 100 px away (TON-322).
 */
const cardGrip = { x: -8, y: 16 };

/**
 * dnd-kit's pointer sensor, also noting where in the item a press lands. The drag starts 6 px later, and by then the
 * item may have moved with its list still scrolling, so the overlay is placed by the press rather than by where the
 * item has got to: placed by the item, the name sat rows away from the pointer (TON-302).
 */
class GripSensor extends PointerSensor {
  static override activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        event: ReactPointerEvent,
        options: PointerSensorOptions,
        context?: { active: DraggableNode },
      ) => {
        const [press] = PointerSensor.activators;
        if (!press?.handler(event, options)) return false;
        const data: unknown = context?.active.data.current;
        const item = context?.active.node.current?.getBoundingClientRect();
        if (isDragItem(data) && data.card === true) grips.set(event.nativeEvent, cardGrip);
        else if (item) {
          grips.set(event.nativeEvent, {
            x: event.clientX - item.left,
            y: event.clientY - item.top,
          });
        }
        return true;
      },
    },
  ];
}

/**
 * Places the overlay at the pointer, less its grip, so it stays where the pointer took hold of the item. Its `top`
 * and `left` are 0 (`overlayAtOrigin`), so the transform places it alone; without a grip, it goes where the item is.
 */
const atGrip: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  const grip = activatorEvent ? grips.get(activatorEvent) : undefined;
  if (grip && activatorEvent instanceof PointerEvent) {
    return {
      ...transform,
      x: activatorEvent.clientX + transform.x - grip.x,
      y: activatorEvent.clientY + transform.y - grip.y,
    };
  }
  return {
    ...transform,
    x: transform.x + (activeNodeRect?.left ?? 0),
    y: transform.y + (activeNodeRect?.top ?? 0),
  };
};
const overlayModifiers = [atGrip];
const overlayAtOrigin = { top: 0, left: 0 };

export function DragProvider({ children }: { children: ReactNode }) {
  // A press that moves less than 6 px is still a click, so links and buttons keep working.
  const sensors = useSensors(useSensor(GripSensor, { activationConstraint: { distance: 6 } }));
  const [active, setActive] = useState<DragItem | undefined>(undefined);
  const [indicator, setIndicator] = useState<Indicator | undefined>(undefined);
  // The folder, or the root, a dragged folder or list is over.
  const [destination, setDestination] = useState<{ to: string | null } | undefined>(undefined);
  // The list a dragged album is over, and whether ⌥ is held, which moves it there from the list on view.
  const [overList, setOverList] = useState<ListTarget | undefined>(undefined);
  const [altHeld, setAltHeld] = useState(false);
  // Where the press that started the drag landed, while it lasts.
  const [pressedAt, setPressedAt] = useState<{ x: number; y: number } | undefined>(undefined);
  const dropOnList = useDropOnList();
  const { tree } = useCollectionData();
  const drops = useRef(new Map<string, ViewMoves["drop"]>());
  // A drop that would change who sees what asks first (TON-226).
  const move = useMoveWithConsent();
  const { enterEditing } = useMode();

  const registerDrop = useCallback((viewKey: string, drop: ViewMoves["drop"]) => {
    drops.current.set(viewKey, drop);
    return () => {
      if (drops.current.get(viewKey) === drop) drops.current.delete(viewKey);
    };
  }, []);

  const end = () => {
    setActive(undefined);
    setPressedAt(undefined);
    setIndicator(undefined);
    setDestination(undefined);
    setOverList(undefined);
  };

  // ⌥ can be pressed or let go at any point of a drag, so it is read from every key and pointer event while one lasts.
  const dragging = active !== undefined;
  useEffect(() => {
    if (!dragging) return undefined;
    const read = (event: KeyboardEvent | PointerEvent) => setAltHeld(event.altKey);
    window.addEventListener("keydown", read);
    window.addEventListener("keyup", read);
    window.addEventListener("pointermove", read);
    return () => {
      window.removeEventListener("keydown", read);
      window.removeEventListener("keyup", read);
      window.removeEventListener("pointermove", read);
    };
  }, [dragging]);

  // Lists scroll as the pointer nears their edges, by whole pixels, which Safari keeps in step (TON-303).
  useEdgeScroll(pressedAt);

  const state = useMemo<DragState>(
    () => ({ active, indicator, registerDrop }),
    [active, indicator, registerDrop],
  );

  return (
    <DragContext value={state}>
      <DndContext
        sensors={sensors}
        collisionDetection={underPointer}
        // Its own scrolling left Safari painting the list away from where the page had it (`useEdgeScroll`).
        autoScroll={false}
        // Virtual rows are placed by a transform, which dnd-kit leaves out of its measures by default. Drop targets
        // are found on the page (`underPointer`), so dnd-kit's measures of them go unused.
        measuring={{ draggable: { measure: placeOf }, dragOverlay: { measure: placeOf } }}
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
        onDragStart={({ active: started, activatorEvent }) => {
          const data = started.data.current;
          if (isDragItem(data)) setActive(data);
          if (activatorEvent instanceof PointerEvent) {
            setPressedAt({ x: activatorEvent.clientX, y: activatorEvent.clientY });
          }
          setAltHeld(
            activatorEvent !== null && "altKey" in activatorEvent && activatorEvent.altKey === true,
          );
        }}
        onDragOver={({ over }) => {
          const data = over?.data.current;
          setDestination(isDestination(data) ? { to: data.parentId } : undefined);
          setOverList(isList(data) ? data : undefined);
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
          if (isList(over)) {
            // Adding to a list is an edit too (DS-45).
            if (item.kind === "album") {
              enterEditing();
              dropOnList(
                { id: item.id, title: item.name },
                { id: over.listId, name: over.name },
                altHeld ? item.listId : undefined,
              );
            }
            return;
          }
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
        <DragOverlay dropAnimation={null} modifiers={overlayModifiers} style={overlayAtOrigin}>
          {active && (
            <div data-slot="drag-overlay" className="flex max-w-72 flex-col items-start gap-1">
              <div className="inline-flex max-w-full items-center rounded-md bg-raised px-3 py-1.5 text-fg-primary shadow-floating">
                <span className="truncate">{active.name}</span>
              </div>
              {overList && (
                <div className="inline-flex max-w-full items-center rounded-md bg-raised px-3 py-1.5 text-small text-fg-secondary shadow-floating">
                  <span className="truncate">
                    {altHeld && active.listId !== undefined ? "Move" : "Add"} to {overList.name}
                  </span>
                </div>
              )}
              <SharingImpactPreview
                query={
                  active.kind === "container" &&
                  destination !== undefined &&
                  canMoveInto(tree, active.id, destination.to)
                    ? { move: active.id, to: destination.to }
                    : undefined
                }
                delay={150}
                className="bg-raised shadow-floating"
              />
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

/** A view's row or card as a drag source, and a drop target among its siblings, laid out along `axis`. */
function useItemDrag(
  item: DragItem & { viewKey: string },
  enabled: boolean,
  draggable: boolean,
  axis: RowTarget["axis"],
) {
  const { active, indicator } = useContext(DragContext);
  const drop = useDroppable({
    id: `row:${item.viewKey}:${item.id}`,
    data: { type: "row", viewKey: item.viewKey, itemId: item.id, axis } satisfies RowTarget,
    disabled: !enabled,
  });
  const drag = useDraggable({
    id: `row-item:${item.viewKey}:${item.id}`,
    data: item,
    disabled: !draggable,
  });
  return {
    drop,
    drag,
    /** Whether anything is being dragged. */
    dragActive: active !== undefined,
    side: indicator?.itemId === item.id ? indicator.side : undefined,
  };
}

/**
 * A view's row as a drag source, by its handle, and a drop target among its siblings, under Manual sort. Answers
 * the row's ref, the handle's props, whether it is being dragged, and where a drop would land beside it.
 */
export function useRowDrag(
  item: DragItem & { viewKey: string },
  enabled: boolean,
  /** Whether it can be dragged even where rows take no drops: an album, onto a list in the tree (TON-229). */
  draggable = enabled,
) {
  const { drop, drag, side } = useItemDrag(item, enabled, draggable, "vertical");
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
    side,
  };
}

/**
 * A view's card as a drag source, held anywhere in it, and a drop target among its siblings, under Manual sort
 * (TON-322). Answers the card's ref and listeners, its drop zone's ref (`setZone`, for `CardDropZone`), whether
 * anything is being dragged, which the zone takes the pointer only while, whether the card is, and where a drop would
 * land beside it: left (`before`) or right.
 */
export function useCardDrag(
  item: DragItem & { viewKey: string },
  enabled: boolean,
  /** Whether it can be dragged even where cards take no drops: an album, onto a list in the tree (TON-229). */
  draggable = enabled,
) {
  const { drop, drag, dragActive, side } = useItemDrag(
    { ...item, card: true },
    enabled,
    draggable,
    "horizontal",
  );
  return {
    ref: drag.setNodeRef,
    listeners: drag.listeners,
    setZone: drop.setNodeRef,
    dragActive,
    dragging: drag.isDragging,
    side,
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

/**
 * A list in the tree, as a place a dragged album joins (DS-49, TON-229): an album from the person's own collection,
 * that the list doesn't hold yet, and nothing while offline (DS-81).
 */
export function useListDrop(list: { id: string; name: string }, enabled: boolean) {
  const { listsByAlbum } = useCollectionData();
  const offline = useConnection() === "offline";
  const { active } = useDndContext();
  const item = active?.data.current;
  const accepts =
    enabled &&
    !offline &&
    isDragItem(item) &&
    item.kind === "album" &&
    item.own === true &&
    !(listsByAlbum.get(item.id) ?? []).includes(list.id);
  const drop = useDroppable({
    id: `list:${list.id}`,
    data: { type: "list", listId: list.id, name: list.name } satisfies ListTarget,
    disabled: !accepts,
  });
  return { setNodeRef: drop.setNodeRef, over: accepts && drop.isOver };
}
