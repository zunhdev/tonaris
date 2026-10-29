// Trash (DS-55, DS-57; FR-01.12, FR-01.13, FR-01.17, FR-01.18), on desktop: a table of units, newest first, each with
// its name, what it holds, when it was deleted, when it expires (in words, the date on hover or focus, warning under
// 3 days) and where it was. A folder's row opens its contents, read-only: they go with the folder. Each unit has
// Restore (R), which asks where or as what when it must (DS-56), and Delete permanently…, confirmed; the header has
// a local name filter and Empty Trash…, confirmed. Every control is a button or a field, so Trash works by keyboard.

import { useNarrowScreen } from "@/features/collection/collection-ui";
import { useCollectionData } from "@/features/collection/data";
import { ConfirmDialog, type Confirmation } from "@/features/shell/confirm-dialog";
import { DesktopOnly } from "@/features/shell/desktop-only";
import { PageHeader } from "@/features/shell/page-header";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useLiveQuery } from "@tanstack/react-db";
import { ChevronRight, Disc3, FolderClosed, ListMusic } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { purgeResultSchema, searchKey, type TrashUnit } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";
import { cn } from "@tonaris/ui/lib/utils";

import { useRecover } from "./recovery";

const day = 86_400_000;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Folder · 6 lists, 2 folders", "List", or "Album" (DS-55). */
function contentsOf(unit: TrashUnit): string {
  if (unit.kind === "album") return "Album";
  const parts = [
    unit.lists > 0 && count(unit.lists, "list", "lists"),
    unit.folders > 0 && count(unit.folders, "folder", "folders"),
  ].filter(Boolean);
  const kind = unit.kind === "folder" ? "Folder" : "List";
  return parts.length === 0 ? kind : `${kind} · ${parts.join(", ")}`;
}

/** How many items deleting the unit removes: its root and what was deleted with it. */
const itemsOf = (unit: TrashUnit) => 1 + unit.folders + unit.lists;

/** "Expires in 12 days", or "Expires within a day", from `now`. */
function expiryText(unit: TrashUnit, now: number): string {
  const days = Math.ceil((Date.parse(unit.expiresAt) - now) / day);
  return days <= 1 ? "Expires within a day" : `Expires in ${days} days`;
}

const icons = { folder: FolderClosed, list: ListMusic, album: Disc3 } as const;

export function TrashView() {
  const client = useSyncClient();
  const narrow = useNarrowScreen();
  const units = useLiveQuery(() => client?.trashUnits, [client]);
  const notify = useNotify();
  const announce = useAnnounce();
  const recover = useRecover();
  const filterId = useId();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [confirmation, setConfirmation] = useState<Confirmation>();
  // Now, refreshed each minute, for the expiry words.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    document.title = "Trash · Tonaris";
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const all = (units.data ?? []).toSorted((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const key = searchKey(filter);
  const shown = key === "" ? all : all.filter((unit) => searchKey(unit.name).includes(key));

  function purge(ids: string[], done: string) {
    if (!client) return;
    const { transaction, mutationId } = client.trash.purge(ids);
    announce(done);
    void (async () => {
      try {
        await transaction.isPersisted.promise;
      } catch {
        // The save-state layer reports a removal that wasn't made.
        return;
      }
      const outcome = client.states.get(mutationId)?.outcome;
      const result =
        outcome?.status === "confirmed" ? purgeResultSchema.safeParse(outcome.result) : undefined;
      const gone = result?.success ? result.data.gone.length : 0;
      notify?.info(
        gone === 0 ? done : `${done} · ${count(gone, "item was", "items were")} already gone`,
      );
    })();
  }

  function confirmPurge(unit: TrashUnit) {
    const items = itemsOf(unit);
    const scope =
      unit.kind === "album"
        ? [
            `The album '${unit.name}'${unit.artist ? ` · ${unit.artist}` : ""}, with its links and field values`,
            "Frees 1 album slot.",
          ]
        : [
            unit.kind === "list"
              ? `The list '${unit.name}'`
              : `The folder '${unit.name}'${unit.folders + unit.lists > 0 ? ` and the ${[unit.lists > 0 && count(unit.lists, "list", "lists"), unit.folders > 0 && count(unit.folders, "folder", "folders")].filter(Boolean).join(" and ")} inside it` : ""}`,
            "Its albums stay in their other lists or in Unsorted.",
          ];
    setConfirmation({
      title: `Permanently delete '${unit.name}'?`,
      scope,
      consequences: ["This can't be undone."],
      action: `Permanently delete ${count(items, "item", "items")}`,
      onConfirm: () => purge([unit.id], `Deleted '${unit.name}' permanently`),
    });
  }

  function confirmEmpty() {
    const albums = all.filter((unit) => unit.kind === "album").length;
    const lists = all.reduce((sum, unit) => sum + unit.lists + (unit.kind === "list" ? 1 : 0), 0);
    const folders = all.reduce(
      (sum, unit) => sum + unit.folders + (unit.kind === "folder" ? 1 : 0),
      0,
    );
    const items = albums + lists + folders;
    setConfirmation({
      title: "Empty Trash?",
      scope: [
        albums > 0 && count(albums, "album", "albums"),
        lists > 0 && count(lists, "list", "lists"),
        folders > 0 && count(folders, "folder", "folders"),
      ].filter((line): line is string => typeof line === "string"),
      consequences: [
        "Albums still in your collection stay; purged albums free their slots.",
        "This can't be undone.",
      ],
      action: `Permanently delete ${count(items, "item", "items")}`,
      onConfirm: () =>
        purge(
          all.map((unit) => unit.id),
          "Trash emptied",
        ),
    });
  }

  function restoreFocused(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key.toLowerCase() !== "r" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const unitId = event.target.closest("tr[data-unit]")?.getAttribute("data-unit");
    const unit = all.find((each) => each.id === unitId);
    if (!unit) return;
    event.preventDefault();
    restore(unit);
  }

  const restore = (unit: TrashUnit) =>
    recover({
      unitId: unit.id,
      rootId: unit.rootId,
      kind: unit.kind,
      name: unit.name,
      parentId: unit.parentId,
    });

  if (narrow) {
    return (
      <>
        <PageHeader title="Trash" back={{ to: "/c", label: "Collection" }} />
        <DesktopOnly what="Trash" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Trash"
        actions={
          <>
            <label htmlFor={filterId} className="sr-only">
              Filter by name
            </label>
            <Input
              id={filterId}
              value={filter}
              placeholder="Filter by name"
              onChange={(event) => setFilter(event.target.value)}
              className="h-8 w-48"
            />
            <Button disabled={all.length === 0} onClick={confirmEmpty}>
              Empty Trash…
            </Button>
          </>
        }
      />
      {units.isReady && all.length === 0 ? (
        <p className="p-8 text-center text-fg-secondary">
          Nothing in Trash. Deleted items stay here for 30 days.
        </p>
      ) : shown.length === 0 ? (
        <p className="p-8 text-center text-fg-secondary">Nothing in Trash matches '{filter}'.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <table aria-label="Trash" className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-subtle text-small text-fg-secondary">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Contents
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Deleted
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Expires
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Was in
                </th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {/* R restores the unit whose row has the focus (DS-55); the row's buttons stay the way in. */}
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <tbody onKeyDown={restoreFocused}>
              {shown.map((unit) => (
                <UnitRows
                  key={unit.id}
                  unit={unit}
                  units={all}
                  now={now}
                  open={open.has(unit.id)}
                  onToggle={() => {
                    const next = new Set(open);
                    if (!next.delete(unit.id)) next.add(unit.id);
                    setOpen(next);
                  }}
                  onRestore={() => restore(unit)}
                  onPurge={() => confirmPurge(unit)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(undefined)} />
    </>
  );
}

function UnitRows({
  unit,
  units,
  now,
  open,
  onToggle,
  onRestore,
  onPurge,
}: {
  unit: TrashUnit;
  units: readonly TrashUnit[];
  now: number;
  open: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const { tree } = useCollectionData();
  const contentsId = useId();
  const Icon = icons[unit.kind];
  const soon = Date.parse(unit.expiresAt) - now < 3 * day;
  const expandable = unit.members.length > 0;

  // Where it was: the collection, an active folder, or a folder in Trash too.
  let place = "—";
  if (unit.kind !== "album") {
    if (unit.parentId === null) place = "Collection";
    else {
      const active = tree.byId.get(unit.parentId)?.name;
      const trashed =
        units.find((each) => each.rootId === unit.parentId)?.name ??
        units.flatMap((each) => each.members).find((member) => member.id === unit.parentId)?.name;
      place =
        active === undefined
          ? trashed === undefined
            ? "A deleted folder"
            : `'${trashed}' (in Trash)`
          : `'${active}'`;
    }
  }

  const name = (
    <>
      <Icon aria-hidden strokeWidth={1.5} className="size-4 shrink-0 text-fg-secondary" />
      <span className="truncate">{unit.name}</span>
      {unit.artist && <span className="truncate text-fg-tertiary">{unit.artist}</span>}
    </>
  );

  return (
    <>
      <tr className="border-b border-subtle" data-unit={unit.id}>
        <th scope="row" className="max-w-0 py-1 pr-3 font-normal">
          {expandable ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={contentsId}
              onClick={onToggle}
              className="flex w-full min-w-0 items-center gap-2 rounded-sm py-1 text-left text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
            >
              <ChevronRight
                aria-hidden
                strokeWidth={1.5}
                className={cn(
                  "size-4 shrink-0 text-fg-tertiary transition-transform",
                  open && "rotate-90",
                )}
              />
              {name}
            </button>
          ) : (
            <span className="flex min-w-0 items-center gap-2 py-1 pl-6 text-fg-primary">
              {name}
            </span>
          )}
        </th>
        <td className="py-1 pr-3 whitespace-nowrap text-fg-secondary">{contentsOf(unit)}</td>
        <td className="py-1 pr-3 whitespace-nowrap text-fg-secondary">
          {dateFormat.format(new Date(unit.deletedAt))}
        </td>
        {/* The cell's text is the expiry, inside the tooltip's trigger. */}
        {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
        <td className="py-1 pr-3 whitespace-nowrap">
          <Tooltip>
            <TooltipTrigger
              render={
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                <span tabIndex={0} />
              }
              className={cn(
                "rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
                soon ? "text-status-warning" : "text-fg-secondary",
              )}
            >
              {expiryText(unit, now)}
            </TooltipTrigger>
            <TooltipContent>{dateTimeFormat.format(new Date(unit.expiresAt))}</TooltipContent>
          </Tooltip>
        </td>
        <td className="max-w-40 truncate py-1 pr-3 text-fg-secondary">{place}</td>
        {/* Its buttons name themselves. */}
        {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
        <td className="py-1 whitespace-nowrap">
          <div className="flex justify-end gap-1">
            <Button size="sm" aria-keyshortcuts="R" onClick={onRestore}>
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={onPurge}>
              Delete permanently…
            </Button>
          </div>
        </td>
      </tr>
      {expandable && open && (
        <tr id={contentsId} className="border-b border-subtle bg-raised">
          <td colSpan={6} className="px-4 py-3">
            <p className="mb-2 text-small text-fg-secondary">
              Part of '{unit.name}' — restore or delete the folder to act on these.
            </p>
            <MemberTree unit={unit} parentId={unit.rootId} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The folders and lists deleted with a folder, nested, read-only. */
function MemberTree({ unit, parentId }: { unit: TrashUnit; parentId: string }) {
  const children = unit.members.filter((member) => member.parentId === parentId);
  if (children.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 pl-4">
      {children.map((member) => {
        const Icon = icons[member.kind];
        return (
          <li key={member.id}>
            <span className="flex items-center gap-2 text-fg-secondary">
              <Icon aria-hidden strokeWidth={1.5} className="size-4 shrink-0" />
              {member.name}
            </span>
            <MemberTree unit={unit} parentId={member.id} />
          </li>
        );
      })}
    </ul>
  );
}
