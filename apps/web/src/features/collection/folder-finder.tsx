// "Find a folder" (DS-49, DS-56; TON-183): the places a folder or list can go, found by typing, since there can be
// hundreds of folders, in a `Finder`. Before anything is typed: Collection, then under "Recent" the folders this device
// last moved things into, then others by path, 8 folders in all; typing finds them by the words of their path, 50 at
// most (`folder-picker`). "Move to…" moves on a choice and previews the active one's sharing, in a block that keeps
// room for two lines (DS-69); the restore prompt checks the one chosen.

import { recentFolders } from "@/common/device";
import { count } from "@/common/words";
import {
  SharingImpactPreview,
  twoLineImpactClass,
  type ImpactQuery,
} from "@/features/sharing/sharing-impact";
import { Library } from "lucide-react";
import { useMemo, useState, type RefObject } from "react";

import { useCollectionUi } from "./collection-ui";
import { Finder, PathText, type FinderGroup, type FinderItem } from "./finder";
import { folderSuggestions, type FolderChoice } from "./folder-picker";
import { ContainerIcon } from "./icons";
import { findByPath, matchLimit, termsOf } from "./list-picker";

export function FolderFinder({
  choices,
  field,
  onChoose,
  chosen,
  impactOf,
}: {
  /** The places to find, as `folderChoices` gives them. */
  choices: readonly FolderChoice[];
  /** The "Find a folder" field, for the caller to focus. */
  field: RefObject<HTMLInputElement | null>;
  /** Gets the place chosen: a folder's ID, or null for Collection. */
  onChoose: (parentId: string | null) => void;
  /** The current choice, checked: a folder's ID, or null for Collection. */
  chosen?: string | null;
  /** What choosing a place would do to sharing, previewed for the active one. */
  impactOf?: (parentId: string | null) => ImpactQuery;
}) {
  const { accountId } = useCollectionUi();
  const [query, setQuery] = useState("");
  // Read once an opening.
  const [recent] = useState(() => recentFolders.read(accountId));

  const suggested = useMemo(() => folderSuggestions(choices, recent), [choices, recent]);
  const terms = useMemo(() => termsOf(query), [query]);
  const found = useMemo(() => findByPath(choices, query), [choices, query]);
  const typed = terms.length > 0;

  const item = (choice: FolderChoice): FinderItem<FolderChoice> => ({
    value: choice,
    key: choice.parentId ?? "collection",
    icon:
      choice.parentId === null ? (
        <Library strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />
      ) : (
        <ContainerIcon kind="folder" />
      ),
    content: <PathText path={choice.path} terms={terms} />,
    checked: chosen !== undefined && chosen === choice.parentId,
    detail: impactOf && (
      <SharingImpactPreview query={impactOf(choice.parentId)} className={twoLineImpactClass} />
    ),
  });
  const groups: FinderGroup<FolderChoice>[] = (
    typed
      ? [{ title: undefined, options: found.shown }]
      : [
          { title: undefined, options: suggested.collection ? [suggested.collection] : [] },
          { title: "Recent", options: suggested.recent },
          {
            title: suggested.recent.length > 0 ? "Other folders" : "Folders",
            options: suggested.others,
          },
        ]
  )
    .filter((group) => group.options.length > 0)
    .map(({ title, options }) => ({ title, items: options.map(item) }));

  const note = typed
    ? found.total === 0
      ? `No folders match '${query.trim()}'.`
      : found.total > matchLimit
        ? `Showing ${matchLimit} of ${found.total}. Keep typing to narrow them down.`
        : undefined
    : suggested.hidden > 0
      ? `Type to find the other ${count(suggested.hidden, "folder", "folders")}.`
      : undefined;

  return (
    <Finder
      label="Find a folder"
      listLabel="Folders"
      field={field}
      query={query}
      onQuery={setQuery}
      groups={groups}
      onChoose={(choice) => onChoose(choice.parentId)}
      note={note}
      status={typed ? count(found.total, "folder", "folders") : ""}
    />
  );
}
