// A finder (DS-115; TON-177, TON-181, TON-183): a field that finds among many by typing, for "Find a list" and "Find a
// folder". A combobox over a listbox, as the palette is: the field keeps the focus, ↑ and ↓ move through the options,
// wrapping, and Enter or a click chooses. Its host gives the options, in groups with optional headings, each with its
// icon and content, and what choosing it would do, shown while it is active; a note under them says what isn't shown.
// Enter never submits a form around it.

// The combobox pattern's listbox, groups and options are plain elements with ARIA roles, as the palette's are: the
// field keeps the focus and its keys, so the options take none.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { Check, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { Input } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

import { matchedParts } from "./list-picker";

/** An option as the finder shows it. */
export type FinderItem<T> = {
  value: T;
  /** Unique among the options. */
  key: string;
  icon: ReactNode;
  content: ReactNode;
  /** The current choice, which has a check. */
  checked?: boolean;
  /** Shown under the options while it is active: what choosing it would do. */
  detail?: ReactNode;
};

export type FinderGroup<T> = { title: string | undefined; items: readonly FinderItem<T>[] };

export function Finder<T>({
  label,
  listLabel,
  field,
  query,
  onQuery,
  groups,
  onChoose,
  note,
  status,
}: {
  /** The field's name and placeholder: "Find a list". */
  label: string;
  /** The listbox's name: "Lists". */
  listLabel: string;
  /** The field, for the host to focus. */
  field: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (query: string) => void;
  groups: readonly FinderGroup<T>[];
  onChoose: (value: T) => void;
  /** What isn't shown, under the options. */
  note?: string | undefined;
  /** Announced politely: how many were found. */
  status: string;
}) {
  const [active, setActive] = useState(0);
  const items = groups.flatMap((group) => group.items);
  const activeAt = Math.min(active, items.length - 1);
  const activeItem = items[activeAt];

  const id = useId();
  const listboxId = `${id}-options`;
  const optionId = (item: FinderItem<T>) => `${id}-${item.key}`;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && items.length > 0) {
      event.preventDefault();
      setActive((activeAt + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      // Not a form's submit: Enter chooses, or does nothing with no options.
      event.preventDefault();
      if (activeItem !== undefined) onChoose(activeItem.value);
    }
  }

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
          aria-label={label}
          aria-expanded={items.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem === undefined ? undefined : optionId(activeItem)}
          autoComplete="off"
          spellCheck={false}
          placeholder={label}
          value={query}
          onChange={(event) => {
            onQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="pl-8"
        />
      </div>
      <div
        id={listboxId}
        role="listbox"
        aria-label={listLabel}
        className={cn("max-h-80 overflow-y-auto", items.length === 0 && "hidden")}
      >
        {groups.map((group, at) => (
          <div
            key={group.title ?? `untitled-${at}`}
            role="group"
            aria-label={group.title}
            className="flex flex-col"
          >
            {group.title && (
              <div aria-hidden className="px-2 pt-2 pb-1 text-small font-medium text-fg-tertiary">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const index = items.indexOf(item);
              return (
                <FinderOption
                  key={item.key}
                  id={optionId(item)}
                  active={index === activeAt}
                  checked={item.checked ?? false}
                  icon={item.icon}
                  onPoint={() => setActive(index)}
                  onChoose={() => onChoose(item.value)}
                >
                  {item.content}
                </FinderOption>
              );
            })}
          </div>
        ))}
      </div>
      {note && <p className="px-2 text-small text-fg-tertiary">{note}</p>}
      {activeItem?.detail !== undefined && <div className="mt-2">{activeItem.detail}</div>}
      <output className="sr-only">{status}</output>
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

/** A path, its folders dimmed, with the parts the typed words match marked. */
export function PathText({ path, terms }: { path: readonly string[]; terms: readonly string[] }) {
  const folders = path.slice(0, -1).join(" › ");
  return (
    <>
      {folders && (
        <span className="text-fg-tertiary">
          <Marked text={folders} terms={terms} /> ›{" "}
        </span>
      )}
      <Marked text={path.at(-1) ?? ""} terms={terms} />
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
