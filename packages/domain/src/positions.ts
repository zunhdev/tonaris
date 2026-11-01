// Personal manual order (TS-16, FR-05.2–FR-05.4): each person's arrangement of a view, as fractional-index keys,
// one per arranged item, and the command that changes them (TON-36). Keys compare bytewise. Items without a key
// follow the arranged ones in the view's fallback order (DS-44), so a new item in a list, folder or the root lands at
// the end without a write. The commands that bring an album into Unsorted, or take an item out of a view, keep
// DS-51's placement here: an album entering Unsorted goes to its top, and an item that leaves a view loses its place.

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

import { actingOwner, applied, baseProblem, isFailure } from "./command-kit";
import type { ChangeInput, CollectionStore, CommandContext, CommandResult } from "./commands";
import { failure } from "./outcomes";
import { viewKeySchema, viewKindOf } from "./views";
import { z } from "./zod";

/** An arranged item's place in one person's view. */
export const positionSchema = z
  .object({
    viewKey: viewKeySchema,
    itemId: z.uuid(),
    key: z.string().meta({ description: "A fractional-index key; keys compare bytewise." }),
  })
  .meta({ description: "An item's place in a person's manual order (TS-16)." });
export type Position = z.infer<typeof positionSchema>;

/** A position's key in the change log and on clients: the view key and the item's ID, joined by a colon. */
export function positionKey(viewKey: string, itemId: string): string {
  return `${viewKey}:${itemId}`;
}

/** Items one `order.set` may place: a view holds at most the collection's 5,000 albums (FR-15). */
export const maxOrderItems = 5_000;

/** Fractional-index keys stay short; anything longer is no key of ours. */
const maxKeyLength = 128;

/** Whether `key` is a fractional-index key, as `fractional-indexing` makes them. */
export function isOrderKey(key: string): boolean {
  if (key.length === 0 || key.length > maxKeyLength) return false;
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sets or clears the keys of some items in one of the person's views (FR-05.2, TS-16): one move, with every key it
 * writes, as one dependent change. `base` holds each item's key before the move, null for one with none (TS-21), so
 * the same item arranged from two sessions is a conflict, and different items both apply (FR-09.4). Every item must
 * be in the view now. A null key clears the item's place.
 */
export async function setOrder(
  { viewKey, keys }: { viewKey: string; keys: Record<string, string | null> },
  base: Record<string, string | null>,
  context: CommandContext,
): Promise<CommandResult> {
  const personId = actingOwner(context, "collection", "You can't arrange this view.");
  if (isFailure(personId)) return personId;
  const { store } = context;
  const kind = await viewKindOf(viewKey, personId, store);
  if (isFailure(kind)) return kind;

  const items = Object.keys(keys);
  if (items.length === 0) {
    return failure("validation_failed", "The mutation changes nothing.", [
      { path: "args.keys", message: "Name at least one item" },
    ]);
  }
  if (items.length > maxOrderItems) {
    return failure("limit_exceeded", `One move can place at most ${maxOrderItems} items.`);
  }
  const unbased = baseProblem(Object.keys(base), items, base);
  if (unbased) return unbased;
  const invalid = items.filter((item) => {
    const key = keys[item];
    return typeof key === "string" && !isOrderKey(key);
  });
  if (invalid.length > 0) {
    return failure(
      "validation_failed",
      "Some places aren't valid.",
      invalid.map((item) => ({ path: `args.keys.${item}`, message: "Not a fractional-index key" })),
    );
  }
  const inView = await store.viewItems(personId, viewKey, kind);
  if (items.some((item) => !inView.has(item))) {
    return failure(
      "not_found",
      kind === "albums"
        ? "An album you moved is no longer here. Check the order, then arrange it again."
        : "A folder or list you moved is no longer here. Check the order, then arrange it again.",
    );
  }

  const current = await store.findPositions(personId, viewKey, items);
  const conflicts = items
    .filter((item) => (current.get(item) ?? null) !== base[item])
    .map((item) => ({
      field: item,
      current: current.get(item) ?? null,
      attempted: keys[item],
      base: base[item],
    }));
  if (conflicts.length > 0) return { status: "conflict", conflicts };

  const changes: ChangeInput[] = [];
  for (const item of items) {
    const key = keys[item] ?? null;
    const before = current.get(item);
    if (key === (before ?? null)) continue;
    const id = positionKey(viewKey, item);
    if (key === null) {
      // oxlint-disable-next-line no-await-in-loop
      await store.deletePosition(personId, viewKey, item);
      changes.push({ entity: "position", id, op: "delete", data: null });
    } else {
      const position = { viewKey, itemId: item, key };
      // oxlint-disable-next-line no-await-in-loop
      await store.savePosition(personId, position);
      changes.push({ entity: "position", id, op: before ? "update" : "insert", data: position });
    }
  }
  return applied(...changes);
}

/** Puts `itemId` at the top of the person's arrangement of `viewKey` (DS-51), as the change to log. */
export async function placeAtTop(
  store: CollectionStore,
  personId: string,
  viewKey: string,
  itemId: string,
): Promise<ChangeInput> {
  // Its own old place, if it had one, isn't the top it goes above.
  const had = await store.deletePosition(personId, viewKey, itemId);
  const first = await store.firstKey(personId, viewKey);
  const position = { viewKey, itemId, key: generateKeyBetween(null, first ?? null) };
  await store.savePosition(personId, position);
  return {
    entity: "position",
    id: positionKey(viewKey, itemId),
    op: had ? "update" : "insert",
    data: position,
  };
}

/** Forgets `itemId`'s place in the person's `viewKey`, as the change to log if it had one (DS-51). */
export async function forgetPlace(
  store: CollectionStore,
  personId: string,
  viewKey: string,
  itemId: string,
): Promise<ChangeInput[]> {
  if (!(await store.deletePosition(personId, viewKey, itemId))) return [];
  return [{ entity: "position", id: positionKey(viewKey, itemId), op: "delete", data: null }];
}

/** Where a move puts an item: before or after another, or at the top or bottom. */
export type Place = "top" | "bottom" | { before: string } | { after: string };

/**
 * The keys one move writes (TS-16): the item's, and, when it goes past unarranged items, theirs first, in their
 * order. `sequence` is the view's manual order by ID, and `keys` the person's keys there. Among arranged items it is
 * one key; a run of equal keys, as two sessions placing into one gap can leave, is skipped to the next greater key so
 * that the key is valid. The web app and MCP's `set_order` both plan their moves with it.
 */
export function planMove(
  sequence: readonly string[],
  keys: ReadonlyMap<string, string>,
  itemId: string,
  place: Place,
): Map<string, string> {
  const rest = sequence.filter((id) => id !== itemId);
  let index = rest.length;
  if (place === "top") index = 0;
  else if (typeof place === "object") {
    const at = rest.indexOf("before" in place ? place.before : place.after);
    if (at !== -1) index = "before" in place ? at : at + 1;
  }
  let arrangedCount = 0;
  while (arrangedCount < rest.length && keys.has(rest[arrangedCount] ?? "")) arrangedCount += 1;
  const keyAt = (at: number) => keys.get(rest[at] ?? "") ?? null;

  const writes = new Map<string, string>();
  if (index <= arrangedCount) {
    const before = index > 0 ? keyAt(index - 1) : null;
    let next = index;
    if (before !== null) {
      while (next < arrangedCount && (keyAt(next) ?? "") <= before) next += 1;
    }
    writes.set(itemId, generateKeyBetween(before, next < arrangedCount ? keyAt(next) : null));
    return writes;
  }
  // Past the arranged items: the unarranged ones before the place get keys first, then the item.
  const after = arrangedCount > 0 ? keyAt(arrangedCount - 1) : null;
  const fresh = generateNKeysBetween(after, null, index - arrangedCount + 1);
  for (const [offset, id] of rest.slice(arrangedCount, index).entries()) {
    writes.set(id, fresh[offset] ?? "");
  }
  writes.set(itemId, fresh.at(-1) ?? "");
  return writes;
}
