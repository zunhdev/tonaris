// Release-type group headers in a view's grid (DS-43; FR-05.7): a 28 px header per group, with its name and count,
// that collapses the group for this tab's session. The header of the group in view stays at the top as the view
// scrolls, following TanStack Virtual's sticky pattern: the range always includes it, and it is the one item placed
// with `position: sticky` rather than at its offset.

import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { collapsedGroups } from "../shell/device";
import { useCollectionUi } from "./collection-ui";
import { groupNames, releaseGroups, type ReleaseGroup } from "./order";
import type { useGridFocus } from "./use-grid";

export const headerHeight = 28;

/** The view's collapsed groups, kept for the tab's session, and how to collapse or expand one. */
export function useCollapsedGroups(
  viewKey: string,
): [ReadonlySet<ReleaseGroup>, (group: ReleaseGroup) => void] {
  const { accountId } = useCollectionUi();
  const readFor = (view: string) => {
    const kept = collapsedGroups.read(accountId, view);
    return new Set(releaseGroups.filter((group) => kept.has(group)));
  };
  const [collapsed, setCollapsed] = useState(() => readFor(viewKey));
  // A new view starts from its own collapsed groups.
  const [shown, setShown] = useState(viewKey);
  if (shown !== viewKey) {
    setShown(viewKey);
    setCollapsed(readFor(viewKey));
  }
  return [
    collapsed,
    (group) => {
      const next = new Set(collapsed);
      if (!next.delete(group)) next.add(group);
      collapsedGroups.write(accountId, viewKey, next);
      setCollapsed(next);
    },
  ];
}

/**
 * Keeps the header of the group in view rendered, so it can stick at the top. `headers` are the virtual items that
 * are headers, in order.
 */
export function useStickyHeader(headers: readonly number[]) {
  const stuck = useRef<number | undefined>(undefined);
  const rangeExtractor = useCallback(
    (range: Range) => {
      stuck.current = headers.findLast((index) => index <= range.startIndex);
      const indexes = defaultRangeExtractor(range);
      return stuck.current === undefined || indexes.includes(stuck.current)
        ? indexes
        : [stuck.current, ...indexes];
    },
    [headers],
  );
  return { rangeExtractor, isStuck: (index: number) => index === stuck.current };
}

/**
 * The style that places a virtual item: stuck at the top for the group in view, else at its offset. A stuck header
 * stays in the flow, so every other item is placed from the top explicitly, not where the flow would put it.
 */
export function placement(stuck: boolean, start: number) {
  return stuck
    ? ({ position: "sticky", top: 0, zIndex: 1 } as const)
    : ({ position: "absolute", top: 0, transform: `translateY(${start}px)` } as const);
}

/** A group's header button: its name and count, and whether it is expanded. */
export function GroupHeader({
  group,
  count,
  collapsed,
  onToggle,
  ...cell
}: {
  group: ReleaseGroup;
  count: number;
  collapsed: boolean;
  onToggle: (group: ReleaseGroup) => void;
} & ReturnType<ReturnType<typeof useGridFocus>["cellProps"]>) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={() => onToggle(group)}
      className="flex h-full min-w-0 items-center gap-1.5 rounded-sm pr-2 text-small text-fg-secondary outline-none hover:text-fg-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
      {...cell}
    >
      <Icon aria-hidden strokeWidth={1.5} className="size-3.5" />
      <span>{groupNames[group]}</span>
      <span className="text-fg-tertiary tabular-nums">
        {count}
        <span className="sr-only">{count === 1 ? " album" : " albums"}</span>
      </span>
    </button>
  );
}
