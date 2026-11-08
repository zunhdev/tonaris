// "Find a list" (DS-46, DS-47, DS-48; TON-177, TON-181): the owner's lists found by typing, since there can be
// thousands, in a `Finder`. Before anything is typed it suggests 8, the lists albums were most recently added to first;
// typing finds lists by the words of their path, 50 at most (`list-picker`). "Add to a list" puts the album in the list
// chosen. The List field of "Add albums" and "New album" makes it the destination, and also offers no list, first,
// with a check on the current choice.

import { count } from "@/common/words";
import { Inbox } from "lucide-react";
import { useMemo, useState, type RefObject } from "react";

import type { Container } from "@tonaris/domain";

import { useCollectionData } from "./data";
import { Finder, PathText, type FinderGroup, type FinderItem } from "./finder";
import { ContainerIcon } from "./icons";
import { findByPath, matchLimit, suggestions, termsOf, type ListChoice } from "./list-picker";

/** An option: a list, or null for no list. */
type Option = ListChoice | null;

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

  const suggested = useMemo(() => suggestions(choices, entriesByList), [choices, entriesByList]);
  const terms = useMemo(() => termsOf(query), [query]);
  const found = useMemo(() => findByPath(choices, query), [choices, query]);
  const typed = terms.length > 0;

  const item = (option: Option): FinderItem<Option> => ({
    value: option,
    key: option?.list.id ?? "none",
    icon:
      option === null ? (
        <Inbox strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />
      ) : (
        <ContainerIcon kind="list" />
      ),
    content: option === null ? none : <PathText path={option.path} terms={terms} />,
    checked: chosen !== undefined && chosen === (option?.list.id ?? null),
  });
  const groups: FinderGroup<Option>[] = (
    typed
      ? [{ title: undefined, options: found.shown }]
      : [
          { title: undefined, options: none === undefined ? [] : [null] },
          { title: "Recent", options: suggested.recent },
          {
            title: suggested.recent.length > 0 ? "Other lists" : "Lists",
            options: suggested.others,
          },
        ]
  )
    .filter((group) => group.options.length > 0)
    .map(({ title, options }) => ({ title, items: options.map(item) }));

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
    <Finder
      label="Find a list"
      listLabel="Lists"
      field={field}
      query={query}
      onQuery={setQuery}
      groups={groups}
      onChoose={(option) => onChoose(option?.list ?? null)}
      note={note}
      status={typed ? count(found.total, "list", "lists") : ""}
    />
  );
}
