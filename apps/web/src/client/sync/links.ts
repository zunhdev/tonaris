// The albums' links to the streaming services (FR-06.2, TS-24): a collection over the snapshot and the stream, one row
// per album and service. Adding a link is `link.set` with no base, changing one is `link.set` with the URL the client
// last saw, and removing one is `link.remove` (TS-21). The optimistic row holds the text as typed; the server reads it
// (TS-40), and the stream brings the canonical URL.

import { serviceLinkKey, uuidv7, type Mutation, type ServiceLink } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

const keyOf = (link: ServiceLink) => serviceLinkKey(link.albumId, link.service);

/** The write that sets `link`, over `base`: the URL the client last saw, or null for none. */
function setWrite(link: ServiceLink, base: string | null) {
  const mutation: Mutation = {
    mutationId: uuidv7(),
    name: "link.set",
    args: { albumId: link.albumId, service: link.service, url: link.url },
    base: { url: base },
  };
  return { key: keyOf(link), mutation };
}

export function createLinkCollection({ engine, writer }: { engine: SyncEngine; writer: Writer }) {
  return snapshotCollection<ServiceLink>(
    engine,
    "links",
    (snapshot) => snapshot.links,
    keyOf,
    (change) => (change.entity === "link" ? { key: change.id, row: change.data } : undefined),
    {
      onInsert: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => setWrite(pending.modified, null)),
        ),
      onUpdate: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => setWrite(pending.modified, pending.original.url)),
        ),
      onDelete: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => {
            const { albumId, service, url } = pending.original;
            const mutation: Mutation = {
              mutationId: uuidv7(),
              name: "link.remove",
              args: { albumId, service },
              base: { url },
            };
            return { key: pending.key, mutation };
          }),
        ),
    },
  );
}

export type LinkCollection = ReturnType<typeof createLinkCollection>;
