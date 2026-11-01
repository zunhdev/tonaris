// Which writes of one request build on another (FR-13.4, TS-25): a write depends on an earlier write of the same
// batch that creates a record it changes or puts something in, such as a list inside a new folder or an album
// added to a new list. The server then runs it only once that write is confirmed, and otherwise skips it, naming
// the write it waited for, rather than running it against a record that doesn't exist. Dependencies exist only
// within a request; the outbox's order covers the rest (TS-22).

import { containerOfView, type Mutation } from "@tonaris/domain";

/** The records a write creates: a field's creation also creates its options. */
function created(mutation: Mutation): string[] {
  switch (mutation.name) {
    case "field.create":
      return [mutation.args.id, ...mutation.args.options.map((option) => option.id)];
    case "album.create":
    case "container.create":
    case "field.addOption":
      return [mutation.args.id];
    // A capture may reuse an album instead; then nothing later in the request refers to the ID it proposed.
    case "album.capture":
      return [mutation.args.albumId];
    // A deletion makes its Trash unit, which an undo recovers.
    case "container.delete":
    case "album.delete":
      return [mutation.args.unitId];
    case "album.update":
    case "album.setArtwork":
    case "field.rename":
    case "field.changeType":
    case "field.renameOption":
    case "field.removeOption":
    case "field.delete":
    case "fieldValue.apply":
    case "fieldValue.set":
    case "fieldValue.remove":
    case "container.rename":
    case "container.move":
    case "container.describe":
    case "trash.recover":
    case "trash.purge":
    case "membership.add":
    case "membership.remove":
    case "link.set":
    case "link.remove":
    case "view.set":
    case "defaults.set":
    case "defaults.setLinkTarget":
    case "defaults.setHiddenServices":
    case "order.set":
    case "share.invite":
    case "share.setLink":
    case "share.resendInvitation":
    case "share.accept":
    case "share.decline":
    case "share.leave":
    case "share.revoke":
    case "share.saveLink":
    case "share.removeReference":
    case "account.setDisplayName":
      return [];
    default:
      return mutation satisfies never;
  }
}

/** The records a write changes or puts something in, other than one it creates. */
function referenced(mutation: Mutation): (string | null)[] {
  switch (mutation.name) {
    case "album.create":
    case "field.create":
    case "defaults.set":
    case "defaults.setLinkTarget":
    case "defaults.setHiddenServices":
    case "account.setDisplayName":
    case "share.saveLink":
      return [];
    case "field.rename":
    case "field.changeType":
    case "field.delete":
    case "album.update":
    case "album.setArtwork":
    case "container.rename":
    case "container.describe":
    case "container.delete":
    case "album.delete":
      return [mutation.args.id];
    case "field.addOption":
      return [mutation.args.fieldId];
    case "field.renameOption":
    case "field.removeOption":
      return [mutation.args.fieldId, mutation.args.optionId];
    case "fieldValue.apply":
    case "fieldValue.set":
    case "fieldValue.remove":
      return [mutation.args.albumId, mutation.args.fieldId];
    case "album.capture":
      return [mutation.args.listId];
    case "container.create":
      return [mutation.args.parentId];
    case "trash.recover":
      return [mutation.args.unitId, mutation.args.parentId ?? null];
    case "trash.purge":
      return mutation.args.unitIds;
    case "container.move":
      return [mutation.args.id, mutation.args.parentId];
    case "view.set":
      return [containerOfView(mutation.args.viewKey) ?? null];
    case "share.invite":
    case "share.setLink":
    case "share.leave":
    case "share.removeReference":
      return [mutation.args.containerId];
    case "share.resendInvitation":
    case "share.accept":
    case "share.decline":
    case "share.revoke":
      return [mutation.args.grantId];
    case "link.set":
    case "link.remove":
      return [mutation.args.albumId];
    case "order.set": {
      const { viewKey, keys } = mutation.args;
      return [containerOfView(viewKey) ?? null, ...Object.keys(keys)];
    }
    case "membership.add":
    case "membership.remove":
      return [mutation.args.listId, mutation.args.albumId];
    default:
      return mutation satisfies never;
  }
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
    for (const id of created(mutation)) {
      if (!creators.has(id)) creators.set(id, mutation.mutationId);
    }
    return dependsOn.length > 0 ? dependsOn : undefined;
  });
}
