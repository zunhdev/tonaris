// Read-only sharing (FR-07; TS-30 to TS-33): who may read a shared folder or list, and what they see. Access comes
// from a source — a person's accepted grant, a link their saved reference names, or a guest's link — on the
// container itself or any folder above it, as long as every container from the source down is active: folder shares
// cover current and future descendants (FR-07.8), follow moves (FR-07.9), and are suspended, not revoked, by Trash
// (FR-07.10). `readableContainers` is the definition; the database's recursive CTEs are tested against it.

import { albumSchema } from "./albums";
import { containerSchema } from "./containers";
import { fieldValueSchema } from "./field-values";
import { customFieldSchema } from "./fields";
import { membershipSchema } from "./memberships";
import type { Principal } from "./principals";
import { serviceLinkSchema } from "./service-links";
import { z } from "./zod";

/**
 * An invitation's lifecycle (TS-33). Only `accepted` gives access; `withdrawn` (the viewer left) and `revoked` (the
 * owner removed it) never resume (FR-07.7, FR-07.10).
 */
export const shareGrantStatuses = [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "revoked",
] as const;
export type ShareGrantStatus = (typeof shareGrantStatuses)[number];

/** An invitation email's delivery, tracked apart from the invitation (FR-07.5, TS-33). */
export const emailStatuses = ["sending", "sent", "failed", "unknown"] as const;
export type EmailStatus = (typeof emailStatuses)[number];

/** Who reads through sharing: a person (signed in, or an MCP connection acting for them), or a link's guest. */
export type ShareViewer = { kind: "person"; userId: string } | { kind: "link"; linkId: string };

/** How `principal` reads shared content (TS-30): an MCP connection reads what its user may (X-01). */
export function viewerOf(principal: Principal): ShareViewer {
  return principal.kind === "guest"
    ? { kind: "link", linkId: principal.linkId }
    : { kind: "person", userId: principal.userId };
}

/** What access is decided from: the hierarchy, and every grant, link and saved reference. */
export type SharingState = {
  containers: readonly { id: string; parentId: string | null; trashed: boolean }[];
  grants: readonly { containerId: string; granteeId: string; status: ShareGrantStatus }[];
  links: readonly { id: string; containerId: string; revoked: boolean }[];
  references: readonly { viewerId: string; containerId: string; linkId: string | null }[];
};

/** The containers `viewer` reads through directly: its accepted grants and live links. */
export function sourcesOf(state: SharingState, viewer: ShareViewer): Set<string> {
  const live = new Map(
    state.links.filter((link) => !link.revoked).map((link) => [link.id, link.containerId]),
  );
  if (viewer.kind === "link") {
    const container = live.get(viewer.linkId);
    return new Set(container === undefined ? [] : [container]);
  }
  const sources = new Set<string>();
  for (const grant of state.grants) {
    if (grant.granteeId === viewer.userId && grant.status === "accepted")
      sources.add(grant.containerId);
  }
  for (const reference of state.references) {
    const container = reference.linkId === null ? undefined : live.get(reference.linkId);
    if (reference.viewerId === viewer.userId && container !== undefined) sources.add(container);
  }
  return sources;
}

/**
 * Every container `viewer` may read, each with the sources it is read through (TS-31): down from each active source
 * through active children only. Assumes nothing of the data: an active child under a trashed folder isn't reached
 * through that folder.
 */
export function readableContainers(
  state: SharingState,
  viewer: ShareViewer,
): Map<string, Set<string>> {
  const active = new Set(state.containers.filter((each) => !each.trashed).map((each) => each.id));
  const children = new Map<string, string[]>();
  for (const { id, parentId } of state.containers) {
    if (parentId !== null) children.set(parentId, [...(children.get(parentId) ?? []), id]);
  }
  const readable = new Map<string, Set<string>>();
  for (const source of sourcesOf(state, viewer)) {
    if (!active.has(source)) continue;
    const pending = [source];
    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
      const through = readable.get(id) ?? new Set();
      if (through.has(source)) continue;
      readable.set(id, through.add(source));
      pending.push(...(children.get(id) ?? []).filter((child) => active.has(child)));
    }
  }
  return readable;
}

const tokenBytes = 32;

/** Base64url without padding (RFC 4648 §5). */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

/** The SHA-256 of a link token, which is all that is stored and looked up (TS-32). */
export async function shareTokenHash(token: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

/** A new link token: 256 random bits, base64url (TS-32), with the hash to store. The token itself is never kept. */
export async function createShareToken(): Promise<{ token: string; hash: Uint8Array }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(tokenBytes)));
  return { token, hash: await shareTokenHash(token) };
}

/**
 * What a viewer sees of a shared container (FR-07.11, FR-07.12): its active subtree, the active albums in its lists
 * with their links, and only the custom fields those albums use, with only the options they choose. The root's
 * parent is withheld, so private folders above it stay unknown; the owner is named by display name only (FR-07.3).
 */
export const sharedSnapshotSchema = z
  .object({
    rootId: z.uuid(),
    owner: z.object({
      displayName: z.string().nullable(),
    }),
    containers: z.array(containerSchema).meta({
      description: "The root, with no parent, and its active folders and lists.",
    }),
    albums: z.array(albumSchema),
    memberships: z.array(membershipSchema),
    links: z.array(serviceLinkSchema),
    fields: z.array(customFieldSchema).meta({
      description: "The fields the albums use, each with only the options they choose.",
    }),
    fieldValues: z.array(fieldValueSchema),
  })
  .meta({ description: "A shared folder or list as its viewers see it (FR-07.11, FR-07.12)." });
export type SharedSnapshot = z.infer<typeof sharedSnapshotSchema>;
