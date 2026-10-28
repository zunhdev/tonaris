// Which writes of one request build on another (FR-13.4, TS-25): a write depends on an earlier write of the same
// batch that creates a record it changes or puts something in, such as a list inside a new folder or an album
// added to a new list. The server then runs it only once that write is confirmed, and otherwise skips it, naming
// the write it waited for, rather than running it against a record that doesn't exist. Dependencies exist only
// within a request; the outbox's order covers the rest (TS-22).

import type { Mutation } from "@tonaris/domain";

/** The record a write creates, if it creates one. */
function created(mutation: Mutation): string | undefined {
  if (
    mutation.name === "album.create" ||
    mutation.name === "container.create" ||
    mutation.name === "field.create"
  ) {
    return mutation.args.id;
  }
  // A capture may reuse an album instead; then nothing later in the request refers to the ID it proposed.
  if (mutation.name === "album.capture") return mutation.args.albumId;
  return undefined;
}

/** The records a write changes or puts something in, other than one it creates. */
function referenced(mutation: Mutation): (string | null)[] {
  if (mutation.name === "album.create" || mutation.name === "field.create") return [];
  if (mutation.name === "field.rename") return [mutation.args.id];
  if (
    mutation.name === "fieldValue.apply" ||
    mutation.name === "fieldValue.set" ||
    mutation.name === "fieldValue.remove"
  ) {
    return [mutation.args.albumId, mutation.args.fieldId];
  }
  if (mutation.name === "album.capture") return [mutation.args.listId];
  if (
    mutation.name === "album.update" ||
    mutation.name === "album.setArtwork" ||
    mutation.name === "container.rename"
  ) {
    return [mutation.args.id];
  }
  if (mutation.name === "container.create") return [mutation.args.parentId];
  if (mutation.name === "container.move") return [mutation.args.id, mutation.args.parentId];
  if (mutation.name === "view.set") {
    const { viewKey } = mutation.args;
    return viewKey === "root" || viewKey === "unsorted" ? [] : [viewKey];
  }
  if (mutation.name === "defaults.set") return [];
  if (mutation.name === "link.set" || mutation.name === "link.remove") {
    return [mutation.args.albumId];
  }
  if (mutation.name === "order.set") {
    const { viewKey, keys } = mutation.args;
    const view = viewKey === "root" || viewKey === "unsorted" ? [] : [viewKey];
    return [...view, ...Object.keys(keys)];
  }
  return [mutation.args.listId, mutation.args.albumId];
}

/** Each write's prerequisites among the earlier writes of `mutations`, as `dependsOn`; undefined for none. */
export function dependenciesOf(mutations: readonly Mutation[]): (string[] | undefined)[] {
  const creators = new Map<string, string>();
  return mutations.map((mutation) => {
    const dependsOn = [
      ...new Set(
        referenced(mutation).flatMap((id) => {
          const creator = id === null ? undefined : creators.get(id);
          return creator ? [creator] : [];
        }),
      ),
    ];
    const id = created(mutation);
    if (id !== undefined && !creators.has(id)) creators.set(id, mutation.mutationId);
    return dependsOn.length > 0 ? dependsOn : undefined;
  });
}
