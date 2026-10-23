// What a view shows (FR-05.2, FR-11.7, DS-44): its sort, direction, grouping and layout, from the person's choices
// for that view where they made one, and from their account defaults otherwise. Folders and the root always show
// rows, combined. Pure, so the precedence is tested without a DOM.

import {
  folderSortModes,
  listSortModes,
  type FolderSortMode,
  type ListSortMode,
  type SortDirection,
  type ViewDefaults,
  type ViewLayout,
  type ViewPrefs,
} from "@tonaris/domain";

/** Lists and Unsorted hold albums; folders and the root hold folders and lists. */
export type ViewKind = "albums" | "containers";

export type Presentation<Mode = ListSortMode | FolderSortMode> = {
  sortMode: Mode;
  sortDir: SortDirection;
  grouped: boolean;
  layout: ViewLayout;
};

export function presentationOf(
  kind: "albums",
  prefs: ViewPrefs | undefined,
  defaults: ViewDefaults,
): Presentation<ListSortMode>;
export function presentationOf(
  kind: "containers",
  prefs: ViewPrefs | undefined,
  defaults: ViewDefaults,
): Presentation<FolderSortMode>;
export function presentationOf(
  kind: ViewKind,
  prefs: ViewPrefs | undefined,
  defaults: ViewDefaults,
): Presentation;
/**
 * The view's presentation. The sort is one choice: its mode and direction come from the view when it has one, or
 * from the defaults for its kind. A mode the kind doesn't take, as a hand-edited record might hold, gives way to the
 * default too.
 */
export function presentationOf(
  kind: ViewKind,
  prefs: ViewPrefs | undefined,
  defaults: ViewDefaults,
): Presentation {
  if (kind === "containers") {
    const own = prefs?.sortMode;
    const chosen = own === "name" || own === "created" || own === "manual";
    return {
      sortMode: chosen ? own : defaults.folderSortMode,
      sortDir: (chosen ? prefs?.sortDir : undefined) ?? defaults.folderSortDir,
      grouped: false,
      layout: "rows",
    };
  }
  const own = prefs?.sortMode;
  const chosen = own === "year" || own === "name" || own === "manual";
  return {
    sortMode: chosen ? own : defaults.listSortMode,
    sortDir: (chosen ? prefs?.sortDir : undefined) ?? defaults.listSortDir,
    grouped: prefs?.grouped ?? defaults.grouped,
    layout: prefs?.layout ?? defaults.layout,
  };
}

/** The defaults that would make `presentation` the view's without a choice of its own: "Save as my default". */
export function defaultsFrom(kind: ViewKind, presentation: Presentation): Partial<ViewDefaults> {
  const { sortMode, sortDir, grouped, layout } = presentation;
  if (kind === "containers") {
    const folderSortMode = folderSortModes.find((mode) => mode === sortMode);
    return folderSortMode ? { folderSortMode, folderSortDir: sortDir } : {};
  }
  const listSortMode = listSortModes.find((mode) => mode === sortMode);
  return { ...(listSortMode ? { listSortMode, listSortDir: sortDir } : {}), grouped, layout };
}
