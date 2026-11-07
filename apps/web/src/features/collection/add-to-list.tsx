// "Add to list…" (DS-46, DS-49): the owner's lists an album isn't in yet, with their folders, for L and the
// inspector's "+ Add to list". Choosing one puts the album in it (FR-01.6), announced (DS-83). Adding is an edit:
// whatever opens it switches to Editing first, and it waits while offline (DS-81).
// There can be thousands of lists (TON-177), so a field finds them by typing: a combobox over a listbox, as the
// palette is (DS-115). Before anything is typed it suggests 8, the lists albums were most recently added to first.

// The combobox pattern's listbox, groups and options are plain elements with ARIA roles, as the palette's are: the
// field keeps the focus and its keys, so the options take none.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { sent } from "@/client/sync/writer";
import { count } from "@/common/words";
import { useAnnounce } from "@/features/sync/announcer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { Album } from "@tonaris/domain";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Input } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionDialogs } from "./collection-dialogs";
import { useCollectionData } from "./data";
import { ContainerIcon } from "./icons";
import {
  findLists,
  listChoices,
  matchedParts,
  matchLimit,
  suggestions,
  termsOf,
  type ListChoice,
} from "./list-picker";

/** The time an entry is made; the server records its own (TON-27). */
const now = () => new Date().toISOString();

export function AddToListDialog() {
  const { addingToList, endAddToList } = useCollectionDialogs();
  const { albumsById } = useCollectionData();
  const field = useRef<HTMLInputElement>(null);
  const album = addingToList === undefined ? undefined : albumsById.get(addingToList);

  return (
    <Dialog
      open={album !== undefined}
      onOpenChange={(open) => {
        if (!open) endAddToList();
      }}
    >
      <DialogContent initialFocus={field}>
        {/* Keyed, so each opening starts with an empty field. */}
        {album && <ListPicker key={album.id} album={album} field={field} onAdded={endAddToList} />}
      </DialogContent>
    </Dialog>
  );
}

type Group = { title: string | undefined; choices: ListChoice[] };

function ListPicker({
  album,
  field,
  onAdded,
}: {
  album: Album;
  field: RefObject<HTMLInputElement | null>;
  onAdded: () => void;
}) {
  const client = useSyncClient();
  const announce = useAnnounce();
  const { tree, listsByAlbum, entriesByList } = useCollectionData();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const choices = useMemo(
    () => listChoices(tree, listsByAlbum.get(album.id) ?? []),
    [album.id, tree, listsByAlbum],
  );
  const suggested = useMemo(() => suggestions(choices, entriesByList), [choices, entriesByList]);
  const terms = useMemo(() => termsOf(query), [query]);
  const found = useMemo(() => findLists(choices, query), [choices, query]);
  const typed = terms.length > 0;

  const groups: Group[] = typed
    ? [{ title: undefined, choices: found.shown }]
    : [
        { title: "Recent", choices: suggested.recent },
        { title: suggested.recent.length > 0 ? "Other lists" : "Lists", choices: suggested.others },
      ].filter((group) => group.choices.length > 0);
  const options = groups.flatMap((group) => group.choices);
  const activeAt = Math.min(active, options.length - 1);
  const activeChoice = options[activeAt];

  const id = useId();
  const listboxId = `${id}-lists`;
  const optionId = (choice: ListChoice) => `${id}-${choice.list.id}`;
  const activeId = activeChoice && optionId(activeChoice);

  function add(choice: ListChoice) {
    if (!client) return;
    sent(client.memberships.insert({ listId: choice.list.id, albumId: album.id, addedAt: now() }));
    announce(`Added ${album.title} to ${choice.list.name}`);
    onAdded();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && options.length > 0) {
      event.preventDefault();
      setActive((activeAt + step + options.length) % options.length);
    } else if (event.key === "Enter" && activeChoice) {
      event.preventDefault();
      add(activeChoice);
    }
  }

  const note = typed
    ? found.total === 0
      ? `No lists match '${query.trim()}'.`
      : found.total > matchLimit
        ? `Showing ${matchLimit} of ${found.total}. Keep typing to narrow them down.`
        : undefined
    : suggested.hidden > 0
      ? `Type to find the other ${count(suggested.hidden, "list", "lists")}.`
      : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add '{album.title}' to a list</DialogTitle>
        <DialogDescription>
          {choices.length > 0
            ? "It stays in its other lists too."
            : "It's in every list already, or there are no lists yet."}
        </DialogDescription>
      </DialogHeader>
      {choices.length > 0 && (
        <div className="flex min-h-0 flex-col gap-2">
          <div className="relative">
            <Search
              strokeWidth={1.5}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-tertiary"
            />
            <Input
              ref={field}
              role="combobox"
              aria-label="Find a list"
              aria-expanded={options.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              autoComplete="off"
              spellCheck={false}
              placeholder="Find a list"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="pl-8"
            />
          </div>
          <div
            id={listboxId}
            role="listbox"
            aria-label="Lists"
            className={cn("max-h-80 overflow-y-auto", options.length === 0 && "hidden")}
          >
            {groups.map((group) => (
              <div
                key={group.title ?? "matches"}
                role="group"
                aria-label={group.title}
                className="flex flex-col"
              >
                {group.title && (
                  <div
                    aria-hidden
                    className="px-2 pt-2 pb-1 text-small font-medium text-fg-tertiary"
                  >
                    {group.title}
                  </div>
                )}
                {group.choices.map((choice) => {
                  const at = options.indexOf(choice);
                  return (
                    <ListOption
                      key={choice.list.id}
                      id={optionId(choice)}
                      choice={choice}
                      terms={terms}
                      active={at === activeAt}
                      onPoint={() => setActive(at)}
                      onChoose={() => add(choice)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {note && <p className="px-2 text-small text-fg-tertiary">{note}</p>}
          <output className="sr-only">{typed ? count(found.total, "list", "lists") : ""}</output>
        </div>
      )}
    </>
  );
}

function ListOption({
  id,
  choice,
  terms,
  active,
  onPoint,
  onChoose,
}: {
  id: string;
  choice: ListChoice;
  terms: readonly string[];
  active: boolean;
  onPoint: () => void;
  onChoose: () => void;
}) {
  const folders = choice.path.slice(0, -1).join(" › ");
  const node = useRef<HTMLDivElement>(null);
  // The active option stays in view as ↑ and ↓ move through them.
  useEffect(() => {
    if (active) node.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    // The field keeps the focus, and its keys reach every option (DS-115).
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      ref={node}
      id={id}
      role="option"
      aria-selected={active}
      onPointerMove={onPoint}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      className={cn(
        "flex h-8 shrink-0 cursor-default items-center gap-2 rounded-md px-2 text-fg-primary",
        active && "bg-hover",
      )}
    >
      <span className="text-fg-secondary">
        <ContainerIcon kind="list" />
      </span>
      <span className="truncate">
        {folders && (
          <span className="text-fg-tertiary">
            <Marked text={folders} terms={terms} /> ›{" "}
          </span>
        )}
        <Marked text={choice.list.name} terms={terms} />
      </span>
    </div>
  );
}

/** `text` with the parts the typed words match marked, in its own spelling (DS-75). */
function Marked({ text, terms }: { text: string; terms: readonly string[] }) {
  const parts = matchedParts(text, terms);
  if (parts.length === 0) return text;
  const pieces = [];
  let at = 0;
  for (const [start, end] of parts) {
    if (start > at) pieces.push(text.slice(at, start));
    pieces.push(
      <mark key={start} className="rounded-sm bg-accent-soft text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) pieces.push(text.slice(at));
  return pieces;
}
