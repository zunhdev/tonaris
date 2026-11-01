// An album's links to the streaming services as clients hold them (TS-11, TS-24), and the commands that edit them
// (TON-46). An album has at most one current link per service (FR-06.2), stored as its canonical URL (TS-40), and
// people add, replace and remove them as editable metadata (FR-06.3). The API reads the pasted text before the lock,
// as capture does, so the command gets the link already parsed, or the reason it couldn't be read. A link that
// changed since the person saw it is a conflict (TS-21); a link capture kept changes only this way (FR-06.4).

import { changeableAlbum } from "./albums";
import type { CapturedLink } from "./capture";
import { applied, conflict, isFailure } from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import { maxLinkLength } from "./limits";
import { serviceNames, streamingServices, type StreamingService } from "./links";
import { failure, type Failure } from "./outcomes";
import { z } from "./zod";

/** An album's link for one service: its canonical URL (FR-06.2, TS-40). */
export const serviceLinkSchema = z
  .object({
    albumId: z.uuid(),
    service: z.enum(streamingServices),
    url: z.string().meta({ description: "The canonical URL (TS-40)." }),
  })
  .meta({ description: "An album's link to a streaming service (FR-06.2)." });
export type ServiceLink = z.infer<typeof serviceLinkSchema>;

/** A link's key in the change log and on clients: the album's ID and the service, joined by a colon. */
export function serviceLinkKey(albumId: string, service: StreamingService): string {
  return `${albumId}:${service}`;
}

/** `link.set`'s arguments: the link as pasted, read by the server (TS-40). */
export const linkSetArgsSchema = z.object({
  albumId: z.uuid(),
  service: z.enum(streamingServices),
  url: z.string().min(1).max(maxLinkLength).meta({ description: "The link as pasted (TS-40)." }),
});
export type LinkSetArgs = z.infer<typeof linkSetArgsSchema>;

export const linkRemoveArgsSchema = z.object({
  albumId: z.uuid(),
  service: z.enum(streamingServices),
});
export type LinkRemoveArgs = z.infer<typeof linkRemoveArgsSchema>;

/** Why a link can't be `wanted`'s: it is `found`'s (FR-06.2). Clients check it as the link is typed. */
export function wrongServiceReason(found: StreamingService, wanted: StreamingService): string {
  return `This is ${aLink(found)}. Paste ${aLink(wanted)} here.`;
}

/** "a Spotify link", "an Apple Music link". */
const aLink = (service: StreamingService) =>
  `${service === "apple-music" ? "an" : "a"} ${serviceNames[service]} link`;

/** A `link.set`'s URL as the API read it before the lock: the link, or why it couldn't be read (TS-40). */
export type PreparedLink =
  | { status: "parsed"; link: CapturedLink }
  | { status: "failed"; failure: Failure };

/**
 * `link.set` (FR-06.3): adds the album's link for `args.service`, or replaces it, if it is still `base.url`. The link
 * must be that service's; the same URL again changes nothing.
 */
export async function setLink(
  args: LinkSetArgs,
  base: { url: string | null },
  context: CommandContext,
): Promise<CommandResult> {
  const album = await changeableAlbum(args.albumId, context);
  if (isFailure(album)) return album;
  const prepared = context.link;
  if (!prepared) {
    return failure("validation_failed", "The link wasn't read.", [
      { path: "args.url", message: "Not read" },
    ]);
  }
  if (prepared.status === "failed") return prepared.failure;
  const { link } = prepared;
  if (link.service !== args.service) {
    return failure("unsupported_link", wrongServiceReason(link.service, args.service));
  }

  const { store } = context;
  const saved = await store.findServiceLink(args.albumId, args.service);
  const current = saved?.url ?? null;
  if (current !== base.url) return conflict("url", current, args.url, base.url);
  if (current === link.url) return applied();

  await store.saveServiceLink(args.albumId, album.ownerId, link);
  const data: ServiceLink = { albumId: args.albumId, service: args.service, url: link.url };
  return applied({
    entity: "link",
    id: serviceLinkKey(args.albumId, args.service),
    op: saved ? "update" : "insert",
    data,
  });
}

/** `link.remove` (FR-06.3): removes the album's link for `args.service` if it is still `base.url`. */
export async function removeLink(
  args: LinkRemoveArgs,
  base: { url: string },
  context: CommandContext,
): Promise<CommandResult> {
  const album = await changeableAlbum(args.albumId, context);
  if (isFailure(album)) return album;
  const { store } = context;
  const saved = await store.findServiceLink(args.albumId, args.service);
  // Removing a link that is already gone changes nothing, as removing an absent entry does.
  if (!saved) return applied();
  if (saved.url !== base.url) return conflict("url", saved.url, null, base.url);

  await store.deleteServiceLink(args.albumId, args.service);
  return applied({
    entity: "link",
    id: serviceLinkKey(args.albumId, args.service),
    op: "delete",
    data: null,
  });
}
