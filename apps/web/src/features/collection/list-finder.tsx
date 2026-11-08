// "Find a list" (DS-46, DS-47, DS-48; TON-177, TON-181): the owner's lists found by typing, since there can be
// thousands. A combobox over a listbox, as the palette is (DS-115). Before anything is typed it suggests 8, the lists
// albums were most recently added to first; typing finds lists by the words of their path, 50 at most (`list-picker`).
// "Add to a list" puts the album in the list chosen. The List field of "Add albums" and "New album" makes it the
// destination, and also offers no list, first, with a check on the current choice.

// The combobox pattern's listbox, groups and options are plain elements with ARIA roles, as the palette's are: the
// field keeps the focus and its keys, so the options take none.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { count } from "@/common/words";
import { Check, Inbox, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type { Container } from "@tonaris/domain";
import { Input } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionData } from "./data";
import { ContainerIcon } from "./icons";
import {
  findLists,
  matchedParts,
  matchLimit,
  suggestions,
  termsOf,
  type ListChoice,
} from "./list-picker";

/** An option: a list, or null for no list. */
type Option = ListChoice | null;
type Group = { title: string | undefined; options: Option[] };

export function ListFinder({
  choices,
  field,
  onChoose,
  none,
  chosen,
}: {
  /** The lists to find, in path order, as `listChoices` gives them. */
  choices: readonly ListChoice[];
  /** The "Find a list" field, for the caller to focus. */
  field: RefObject<HTMLInputElement | null>;
  /** Gets the list chosen, or null for no list. */
  onChoose: (list: Container | null) => void;
  /** The name of an option for no list, offered first before anything is typed. */
  none?: string;
  /** The current choice, checked: a list's ID, or null for no list. */
  chosen?: string | null;
}) {
  const { entriesByList } = useCollectionData();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const suggested = useMemo(() => suggestions(choices, entriesByList), [choices, entriesByList]);
  const terms = useMemo(() => termsOf(query), [query]);
  const found = useMemo(() => findLists(choices, query), [choices, query]);
  const typed = terms.length > 0;

  const groups: Group[] = typed
    ? [{ title: undefined, options: found.shown }]
    : [
        { title: undefined, options: none === undefined ? [] : [null] },
        { title: "Recent", options: suggested.recent },
        { title: suggested.recent.length > 0 ? "Other lists" : "Lists", options: suggested.others },
      ].filter((group) => group.options.length > 0);
  const options = groups.flatMap((group) => group.options);
  const activeAt = Math.min(active, options.length - 1);
  const activeOption = options[activeAt];

  const id = useId();
  const listboxId = `${id}-lists`;
  const optionId = (option: Option) => `${id}-${option?.list.id ?? "none"}`;
  const activeId = activeOption === undefined ? undefined : optionId(activeOption);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && options.length > 0) {
      event.preventDefault();
      setActive((activeAt + step + options.length) % options.length);
    } else if (event.key === "Enter" && activeOption !== undefined) {
      event.preventDefault();
      onChoose(activeOption?.list ?? null);
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
            key={group.title ?? (typed ? "matches" : "none")}
            role="group"
            aria-label={group.title}
            className="flex flex-col"
          >
            {group.title && (
              <div aria-hidden className="px-2 pt-2 pb-1 text-small font-medium text-fg-tertiary">
                {group.title}
              </div>
            )}
            {group.options.map((option) => {
              const at = options.indexOf(option);
              return (
                <FinderOption
                  key={option?.list.id ?? "none"}
                  id={optionId(option)}
                  active={at === activeAt}
                  checked={chosen !== undefined && chosen === (option?.list.id ?? null)}
                  icon={
                    option === null ? (
                      <Inbox strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />
                    ) : (
                      <ContainerIcon kind="list" />
                    )
                  }
                  onPoint={() => setActive(at)}
                  onChoose={() => onChoose(option?.list ?? null)}
                >
                  {option === null ? none : <Path choice={option} terms={terms} />}
                </FinderOption>
              );
            })}
          </div>
        ))}
      </div>
      {note && <p className="px-2 text-small text-fg-tertiary">{note}</p>}
      <output className="sr-only">{typed ? count(found.total, "list", "lists") : ""}</output>
    </div>
  );
}

function FinderOption({
  id,
  active,
  checked,
  icon,
  onPoint,
  onChoose,
  children,
}: {
  id: string;
  active: boolean;
  checked: boolean;
  icon: ReactNode;
  onPoint: () => void;
  onChoose: () => void;
  children: ReactNode;
}) {
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
      aria-checked={checked || undefined}
      onPointerMove={onPoint}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      className={cn(
        "flex h-8 shrink-0 cursor-default items-center gap-2 rounded-md px-2 text-fg-primary",
        active && "bg-hover",
      )}
    >
      <span className="text-fg-secondary">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checked && (
        <Check strokeWidth={1.5} aria-hidden className="size-4 shrink-0 text-accent-solid" />
      )}
    </div>
  );
}

/** A list's path, its folders dimmed, with the parts the typed words match marked. */
function Path({ choice, terms }: { choice: ListChoice; terms: readonly string[] }) {
  const folders = choice.path.slice(0, -1).join(" › ");
  return (
    <>
      {folders && (
        <span className="text-fg-tertiary">
          <Marked text={folders} terms={terms} /> ›{" "}
        </span>
      )}
      <Marked text={choice.list.name} terms={terms} />
    </>
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
