// Settings → Preferences (DS-94, FR-11.7, FR-11.8): the account defaults every view follows where its person made no
// choice of its own: the sort, direction, grouping and layout of lists and Unsorted, and the sort and direction of
// folders and the collection. Each choice is saved to the account at once, and reaches the person's other sessions
// (account-defaults.ts). Views with choices of their own keep them. Links: whether service links open the services'
// web pages or their apps (FR-06.6, TON-104). Streaming services: the ones the person uses, a switch each; the album
// panel and New album show link fields only for those, while saved links still show (TON-138); dragged into the
// person's order, which every list of an album's services follows (TON-282). App: how to install Tonaris (TON-298).

import { pageScroll } from "@/common/page-scroll";
import { DropLine } from "@/features/collection/album-rows";
import {
  directionOptions,
  folderSortOptions,
  groupingOptions,
  layoutOptions,
  listSortOptions,
} from "@/features/collection/view-options";
import { useAnnounce } from "@/features/sync/announcer";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import {
  serviceNames,
  servicesInOrder,
  type LinkTarget,
  type StreamingService,
} from "@tonaris/domain";
import { Field } from "@tonaris/ui/components/field";
import { SegmentedControl, type SegmentedOption } from "@tonaris/ui/components/segmented-control";
import { Switch } from "@tonaris/ui/components/switch";
import { cn } from "@tonaris/ui/lib/utils";

import { useAccountDefaults } from "./account-defaults";
import { InstallApp } from "./install-app";

const linkTargetOptions: readonly SegmentedOption<LinkTarget>[] = [
  { value: "web", label: "Web page" },
  { value: "app", label: "App" },
];

export function PreferencesSettings() {
  const { defaults, ready, set } = useAccountDefaults();
  return (
    <div {...pageScroll("view")} className="flex max-w-2xl flex-col gap-8 overflow-y-auto p-6">
      <section aria-labelledby="list-defaults" className="flex max-w-sm flex-col gap-3">
        <h2 id="list-defaults" className="text-title text-fg-primary">
          Lists and Unsorted
        </h2>
        <Field group label="Sort">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={listSortOptions}
              value={defaults.listSortMode}
              disabled={!ready}
              onValueChange={(listSortMode) => set({ listSortMode })}
            />
          )}
        </Field>
        <Field group label="Direction">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={directionOptions}
              value={defaults.listSortDir}
              disabled={!ready || defaults.listSortMode === "manual"}
              onValueChange={(listSortDir) => set({ listSortDir })}
            />
          )}
        </Field>
        <Field group label="Grouping">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={groupingOptions}
              value={defaults.grouped ? "type" : "none"}
              disabled={!ready}
              onValueChange={(grouping) => set({ grouped: grouping === "type" })}
            />
          )}
        </Field>
        <Field group label="Layout">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={layoutOptions}
              value={defaults.layout}
              disabled={!ready}
              onValueChange={(layout) => set({ layout })}
            />
          )}
        </Field>
      </section>

      <section aria-labelledby="folder-defaults" className="flex max-w-sm flex-col gap-3">
        <h2 id="folder-defaults" className="text-title text-fg-primary">
          Folders and Collection
        </h2>
        <Field group label="Sort">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={folderSortOptions}
              value={defaults.folderSortMode}
              disabled={!ready}
              onValueChange={(folderSortMode) => set({ folderSortMode })}
            />
          )}
        </Field>
        <Field group label="Direction">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={directionOptions}
              value={defaults.folderSortDir}
              disabled={!ready || defaults.folderSortMode === "manual"}
              onValueChange={(folderSortDir) => set({ folderSortDir })}
            />
          )}
        </Field>
        <Field group label="Layout">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={layoutOptions}
              value={defaults.folderLayout}
              disabled={!ready}
              onValueChange={(folderLayout) => set({ folderLayout })}
            />
          )}
        </Field>
      </section>

      <p className="max-w-md text-fg-secondary">
        Folders, lists and views where you've chosen options in View options keep them when you
        change these defaults. Choose "Use account defaults" there to follow these again.
      </p>

      <section aria-labelledby="link-target" className="flex max-w-sm flex-col gap-3">
        <h2 id="link-target" className="text-title text-fg-primary">
          Links
        </h2>
        <Field group label="Open links in">
          {(_, id) => (
            <SegmentedControl
              aria-labelledby={id}
              options={linkTargetOptions}
              value={defaults.linkTarget}
              disabled={!ready}
              onValueChange={(linkTarget) => set({ linkTarget })}
            />
          )}
        </Field>
        <p className="text-small text-fg-secondary">
          App opens Spotify, Apple Music, Qobuz and Tidal links in their apps, on every device you
          use. A link to a service whose app isn't installed won't open. YouTube Music has no
          desktop app, so its links open the page.
        </p>
      </section>

      <section aria-labelledby="streaming-services" className="flex max-w-sm flex-col gap-3">
        <h2 id="streaming-services" className="text-title text-fg-primary">
          Streaming services
        </h2>
        <StreamingServices />
        <p className="text-small text-fg-secondary">
          Drag a service by its handle, or press ⌥↑ or ⌥↓ on its switch, to put the ones you use
          most first. An album lists its links in this order.
        </p>
        <p className="text-small text-fg-secondary">
          The album panel and New album show link fields only for the services that are on. Links
          you've already saved still show, and you can paste a link from any service.
        </p>
      </section>

      <InstallApp />
    </div>
  );
}

/**
 * The streaming services in the person's order, each with its switch (TON-138, TON-282). A service's handle drags it
 * to another place, a line showing where it would land; with its switch focused, ⌥↑ and ⌥↓ move it a place (DS-49).
 * The handle is for the pointer only, as the views' are (DS-21), and each move is announced (DS-83).
 */
function StreamingServices() {
  const { defaults, ready, setService, moveService } = useAccountDefaults();
  const order = servicesInOrder(defaults.serviceOrder);
  const announce = useAnnounce();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [drag, setDrag] = useState<{ from: number; over: number | undefined }>();
  // A service moved by keyboard keeps the focus on its switch, which React may take out and put back in the list.
  const refocus = useRef<StreamingService | undefined>(undefined);
  useLayoutEffect(() => {
    const service = refocus.current;
    if (service === undefined) return;
    refocus.current = undefined;
    document.getElementById(`service-switch-${service}`)?.focus();
  });
  const placeOf = (id: UniqueIdentifier | undefined) =>
    order.findIndex((service) => service === id);

  function move(service: StreamingService, to: number, byKeyboard: boolean) {
    if (to < 0 || to >= order.length || order[to] === service) return;
    if (byKeyboard) refocus.current = service;
    moveService(service, to);
    announce(`Moved ${serviceNames[service]} to position ${to + 1} of ${order.length}`);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // The moves are announced here, once they're made (DS-83).
      accessibility={{
        announcements: {
          onDragStart: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: () => undefined,
          onDragCancel: () => undefined,
        },
        screenReaderInstructions: { draggable: "" },
      }}
      onDragStart={({ active }) => setDrag({ from: placeOf(active.id), over: undefined })}
      onDragOver={({ over }) =>
        setDrag((current) => current && { ...current, over: over ? placeOf(over.id) : undefined })
      }
      onDragEnd={({ active, over }) => {
        setDrag(undefined);
        const service = order[placeOf(active.id)];
        const to = placeOf(over?.id);
        if (service !== undefined && to !== -1) move(service, to, false);
      }}
      onDragCancel={() => setDrag(undefined)}
    >
      <ul className="flex flex-col gap-2.5">
        {order.map((service, index) => {
          const landing = drag && drag.over === index && drag.from !== index;
          return (
            <ServiceRow
              key={service}
              service={service}
              line={landing ? (drag.from < index ? "after" : "before") : undefined}
              on={!defaults.hiddenServices.includes(service)}
              ready={ready}
              onToggle={(on) => setService(service, on)}
              onStep={(step) => move(service, index + step, true)}
            />
          );
        })}
      </ul>
    </DndContext>
  );
}

function ServiceRow({
  service,
  line,
  on,
  ready,
  onToggle,
  onStep,
}: {
  service: StreamingService;
  /** Where a dragged service would land, at this one. */
  line: "before" | "after" | undefined;
  on: boolean;
  ready: boolean;
  onToggle: (on: boolean) => void;
  /** Moves the service a place up (-1) or down (1). */
  onStep: (step: -1 | 1) => void;
}) {
  const {
    setNodeRef: setHandle,
    listeners,
    transform,
    isDragging,
  } = useDraggable({ id: service, disabled: !ready });
  const { setNodeRef: setTarget } = useDroppable({ id: service });
  return (
    <li
      ref={setTarget}
      data-slot="service-row"
      className={cn(
        "relative flex items-center gap-2 rounded-md",
        isDragging && "z-10 bg-raised shadow-floating",
      )}
      style={transform ? { transform: `translate3d(0, ${transform.y}px, 0)` } : undefined}
    >
      {line === "before" && <DropLine side="before" />}
      <span
        ref={setHandle}
        aria-hidden
        data-slot="drag-handle"
        className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-fg-tertiary hover:text-fg-primary"
        {...listeners}
      >
        <GripVertical strokeWidth={1.5} className="size-3.5" />
      </span>
      <span id={`service-${service}`} className="flex-1 text-fg-primary">
        {serviceNames[service]}
      </span>
      <Switch
        id={`service-switch-${service}`}
        aria-labelledby={`service-${service}`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        checked={on}
        disabled={!ready}
        onCheckedChange={onToggle}
        onKeyDown={(event) => {
          if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onStep(event.key === "ArrowUp" ? -1 : 1);
        }}
      />
      {line === "after" && <DropLine side="after" />}
    </li>
  );
}
