// The order and grouping of a view's contents, shared with the export's Markdown from `@tonaris/domain` (TS-82), and
// the keyboard's moves (DS-49). A move is planned as the keys it writes, by `planMove`, which MCP shares. Pure, so the
// rules are tested without a DOM.

export {
  arranged,
  chronology,
  groupNames,
  groupOf,
  planMove,
  releaseGroups,
  sections,
  sortAlbums,
  sortContainers,
  sortYear,
  type Keys,
  type Place,
  type ReleaseGroup,
  type Section,
  type Sort,
} from "@tonaris/domain";

import type { Place } from "@tonaris/domain";

/** A keyboard move (DS-49): by one, or to the top or bottom. */
export type Direction = "up" | "down" | "top" | "bottom";

/**
 * Where moving `id` `to` puts it among `group`, the items it moves among in their order (a group's, when grouped),
 * and its position there from 1; nothing when it is already at that end.
 */
export function placeIn(
  group: readonly string[],
  id: string,
  to: Direction,
): { place: Place; position: number } | undefined {
  const index = group.indexOf(id);
  const last = group.length - 1;
  const first = group[0];
  const end = group[last];
  if (index === -1 || first === undefined || end === undefined) return undefined;
  if (to === "up" || to === "top") {
    const before = to === "up" ? group[index - 1] : first;
    return index === 0 || before === undefined
      ? undefined
      : { place: { before }, position: to === "up" ? index : 1 };
  }
  const after = to === "down" ? group[index + 1] : end;
  return index === last || after === undefined
    ? undefined
    : { place: { after }, position: to === "down" ? index + 2 : group.length };
}
