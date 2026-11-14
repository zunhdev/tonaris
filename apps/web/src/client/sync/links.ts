// The albums' links to the streaming services (FR-06.2, TS-24): a collection over the snapshot and the stream, one row
// per album and service. Adding a link is `link.set` with no base, changing one is `link.set` with the URL the client
// last saw, and removing one is `link.remove` (TS-21). The optimistic row holds the text as typed; the server reads it
// (TS-40), and the stream brings the canonical URL.

import { serviceLinkKey, type ServiceLink } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";
import { envelope } from "./writes";

const keyOf = (link: ServiceLink) => serviceLinkKey(link.albumId, link.service);

/** The write that sets `link`, over `base`: the URL the client last saw, or null for none. */
const setWrite = ({ albumId, service, url }: ServiceLink, base: string | null) => [
  envelope("link.set", { albumId, service, url }, { url: base }),
];

export function createLinkCollection({ engine, writer }: { engine: SyncEngine; writer: Writer }) {
  return snapshotCollection({
    engine,
    id: "links",
    entity: "link",
    rows: (snapshot) => snapshot.links,
    getKey: keyOf,
    handlers: {
      onInsert: ({ transaction }) =>
        writer.persistEach(transaction, ({ modified }) => setWrite(modified, null)),
      onUpdate: ({ transaction }) =>
        writer.persistEach(transaction, ({ original, modified }) =>
          setWrite(modified, original.url),
        ),
      onDelete: ({ transaction }) =>
        writer.persistEach(transaction, ({ original: { albumId, service, url } }) => [
          envelope("link.remove", { albumId, service }, { url }),
        ]),
    },
  });
}

export type LinkCollection = ReturnType<typeof createLinkCollection>;

/**
 * Sets an album's link for a service: an update of the one it has, or an insert, so the write names the right base,
 * the URL the client last saw (TS-21). Every place that saves a link asks here (DRIFT-051).
 */
export function setLink(links: LinkCollection, { albumId, service, url }: ServiceLink) {
  const key = serviceLinkKey(albumId, service);
  return links.has(key)
    ? links.update(key, (record) => {
        record.url = url;
      })
    : links.insert({ albumId, service, url });
}
