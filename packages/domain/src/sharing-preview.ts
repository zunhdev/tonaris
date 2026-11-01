// A sharing preview's question answered (FR-07.9, FR-07.10, FR-07.14; DS-69): whether a move or a recovery can go
// where it asks, and what it would do to the owner's sharing, by the rules of sharing-impact.ts. Pure, over the
// owner's sharing and the Trash unit storage reads, so the app's preview and MCP's report agree.

import { chainOf, treeOf } from "./container-tree";
import {
  listsImpact,
  moveImpact,
  recoveryImpact,
  type ImpactState,
  type SharingImpact,
} from "./sharing-impact";

/** A move of a folder or list into a folder or the root, or a Trash unit's recovery, by default to where it was. */
export type ImpactQuery =
  | { kind: "move"; id: string; to: string | null }
  | { kind: "recover"; unitId: string; to?: string | null };

/**
 * The owner's Trash unit a recovery names, as storage reads it: an album's, with the active lists it is in, or a
 * folder's or list's, with the containers deleted with it.
 */
export type ImpactUnit =
  | { kind: "album"; rootId: string; listIds: readonly string[] }
  | { kind: "folder" | "list"; rootId: string; memberIds: readonly string[] };

/**
 * What `query` would do to the owner's sharing, `state` with which of their containers are `folders`: `not_found` if
 * it names nothing of theirs (no `unit` for a recovery), `invalid` if the destination isn't an active folder of theirs
 * or is inside what moves.
 */
export function impactOf(
  state: ImpactState & { folders: ReadonlySet<string> },
  query: ImpactQuery,
  unit?: ImpactUnit,
): SharingImpact | "not_found" | "invalid" {
  const tree = treeOf(state.containers);
  const activeFolder = (id: string | null) =>
    id === null || (state.folders.has(id) && tree.byId.get(id)?.trashed === false);

  if (query.kind === "move") {
    const item = tree.byId.get(query.id);
    if (!item || item.trashed) return "not_found";
    if (!activeFolder(query.to)) return "invalid";
    if (chainOf(tree, query.to).includes(query.id)) return "invalid";
    return moveImpact(state, query.id, query.to);
  }

  if (!unit) return "not_found";
  if (unit.kind === "album") return listsImpact(state, unit.listIds);
  // Asked for no destination, a unit whose folder is gone or in Trash is previewed at the root, where `trash.recover`
  // instead asks for a destination (FR-01.15).
  const where = tree.byId.get(unit.rootId)?.parentId ?? null;
  const to = query.to === undefined ? (activeFolder(where) ? where : null) : query.to;
  if (!activeFolder(to)) return "invalid";
  const ids = [unit.rootId, ...unit.memberIds.filter((id) => id !== unit.rootId)];
  return recoveryImpact(state, ids, to);
}
