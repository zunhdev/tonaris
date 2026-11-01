// View options (DS-49): the View button in a collection view's header, also opened with `V`, and its popover. It
// sets the view's sort, direction (not for manual order), and for lists and Unsorted the grouping and layout. Each
// choice is remembered for the view and saved to the account (FR-11.7, FR-11.8); "Use account defaults" forgets the
// view's choices, and "Save as my default" makes them the defaults for its kind of view. Defaults are also set in
// Settings → Preferences (DS-94). Rearranging comes with manual order (TON-36).

import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  LayoutGrid,
  Rows3,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import type { FolderSortMode, ListSortMode, SortDirection, ViewLayout } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@tonaris/ui/components/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@tonaris/ui/components/popover";
import { SegmentedControl, type SegmentedOption } from "@tonaris/ui/components/segmented-control";

import { useNarrowScreen } from "../shell/media";
import { useCollectionUi } from "./collection-ui";
import type { ViewKind } from "./presentation";
import { usePresentation, type ViewPresentation } from "./use-presentation";

export const listSortOptions: readonly SegmentedOption<ListSortMode>[] = [
  { value: "year", label: "Year" },
  { value: "name", label: "Name" },
  { value: "manual", label: "Manual" },
];

export const folderSortOptions: readonly SegmentedOption<FolderSortMode>[] = [
  { value: "name", label: "Name" },
  { value: "created", label: "Created" },
  { value: "manual", label: "Manual" },
];

export const directionOptions: readonly SegmentedOption<SortDirection>[] = [
  {
    value: "asc",
    label: (
      <>
        <ArrowUpNarrowWide aria-hidden strokeWidth={1.5} />
        Ascending
      </>
    ),
  },
  {
    value: "desc",
    label: (
      <>
        <ArrowDownWideNarrow aria-hidden strokeWidth={1.5} />
        Descending
      </>
    ),
  },
];

export const groupingOptions: readonly SegmentedOption<"none" | "type">[] = [
  { value: "none", label: "None" },
  { value: "type", label: "Release type" },
];

export const layoutOptions: readonly SegmentedOption<ViewLayout>[] = [
  {
    value: "rows",
    label: (
      <>
        <Rows3 aria-hidden strokeWidth={1.5} />
        Rows
      </>
    ),
  },
  {
    value: "grid",
    label: (
      <>
        <LayoutGrid aria-hidden strokeWidth={1.5} />
        Grid
      </>
    ),
  },
];

/** One choice: its name over its control. */
export function Choice({
  label,
  children,
}: {
  label: string;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-small text-fg-secondary">
        {label}
      </span>
      {children(id)}
    </div>
  );
}

export function ViewOptions({ viewKey, kind }: { viewKey: string; kind: ViewKind }) {
  const [open, setOpen] = useState(false);
  const { setViewOptionsOpener } = useCollectionUi();
  const narrow = useNarrowScreen();
  useEffect(() => {
    setViewOptionsOpener(() => setOpen(true));
    return () => setViewOptionsOpener(undefined);
  }, [setViewOptionsOpener]);
  const choices =
    kind === "albums" ? (
      <AlbumViewChoices viewKey={viewKey} />
    ) : (
      <FolderViewChoices viewKey={viewKey} />
    );

  // A phone's are a bottom sheet (DS-110).
  if (narrow) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          aria-label="View options"
          className="size-11"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal aria-hidden strokeWidth={1.5} />
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <DialogHeader>
              <DialogTitle>View options</DialogTitle>
            </DialogHeader>
            {choices}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" aria-keyshortcuts="V" />}>
        <SlidersHorizontal aria-hidden strokeWidth={1.5} />
        View
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <PopoverTitle className="sr-only">View options</PopoverTitle>
        {choices}
      </PopoverContent>
    </Popover>
  );
}

/** A list's or Unsorted's choices: the sort, its direction, the grouping and the layout. */
function AlbumViewChoices({ viewKey }: { viewKey: string }) {
  const view = usePresentation(viewKey, "albums");
  const { presentation, choose } = view;
  return (
    <>
      <Choice label="Sort">
        {(id) => (
          <SegmentedControl
            aria-labelledby={id}
            options={listSortOptions}
            value={presentation.sortMode}
            onValueChange={(sortMode) => choose({ sortMode })}
          />
        )}
      </Choice>
      <DirectionChoice
        sortMode={view.presentation.sortMode}
        sortDir={view.presentation.sortDir}
        onChange={(sortDir) => view.choose({ sortDir })}
      />
      <Choice label="Grouping">
        {(id) => (
          <SegmentedControl
            aria-labelledby={id}
            options={groupingOptions}
            value={presentation.grouped ? "type" : "none"}
            onValueChange={(grouping) => choose({ grouped: grouping === "type" })}
          />
        )}
      </Choice>
      <Choice label="Layout">
        {(id) => (
          <SegmentedControl
            aria-labelledby={id}
            options={layoutOptions}
            value={presentation.layout}
            onValueChange={(layout) => choose({ layout })}
          />
        )}
      </Choice>
      <DefaultsFooter view={view} />
    </>
  );
}

/** A folder's or the root's choices: the sort and its direction. */
function FolderViewChoices({ viewKey }: { viewKey: string }) {
  const view = usePresentation(viewKey, "containers");
  return (
    <>
      <Choice label="Sort">
        {(id) => (
          <SegmentedControl
            aria-labelledby={id}
            options={folderSortOptions}
            value={view.presentation.sortMode}
            onValueChange={(sortMode) => view.choose({ sortMode })}
          />
        )}
      </Choice>
      <DirectionChoice
        sortMode={view.presentation.sortMode}
        sortDir={view.presentation.sortDir}
        onChange={(sortDir) => view.choose({ sortDir })}
      />
      <DefaultsFooter view={view} />
    </>
  );
}

/** The direction, which manual order doesn't have. */
function DirectionChoice({
  sortMode,
  sortDir,
  onChange,
}: {
  sortMode: string;
  sortDir: SortDirection;
  onChange: (sortDir: SortDirection) => void;
}) {
  return (
    <Choice label="Direction">
      {(id) => (
        <SegmentedControl
          aria-labelledby={id}
          options={directionOptions}
          value={sortDir}
          disabled={sortMode === "manual"}
          onValueChange={onChange}
        />
      )}
    </Choice>
  );
}

function DefaultsFooter({
  view,
}: {
  view: Pick<ViewPresentation, "remembered" | "isDefault" | "resetToDefaults" | "saveAsDefault">;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-subtle pt-3">
      <Button size="sm" variant="ghost" disabled={!view.remembered} onClick={view.resetToDefaults}>
        Use account defaults
      </Button>
      <Button size="sm" disabled={view.isDefault} onClick={view.saveAsDefault}>
        Save as my default
      </Button>
    </div>
  );
}
