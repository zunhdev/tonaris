// Read-only sharing (FR-07; TS-30 to TS-33): who may read a shared folder or list, and what they see. Access comes
// from a source — a person's accepted grant, a link their saved reference names, or a guest's link — on the
// container itself or any folder above it, as long as every container from the source down is active: folder shares
// cover current and future descendants (FR-07.8), follow moves (FR-07.9), and are suspended, not revoked, by Trash
// (FR-07.10). `readableContainers` is the definition; the database's recursive CTEs are tested against it.

import { emailKey } from "./accounts";
import { albumSchema } from "./albums";
import type { CommandContext, CommandResult } from "./commands";
import { containerSchema } from "./containers";
import { fieldValueSchema } from "./field-values";
import { customFieldSchema } from "./fields";
import { maxNameLength } from "./limits";
import { membershipSchema } from "./memberships";
import { isBlankName } from "./names";
import { failure } from "./outcomes";
import { authorizeWrite } from "./policies";
import { actingUserId, type Principal } from "./principals";
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

/** Base64url without padding (RFC 4648 §5). */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

const encoder = new TextEncoder();

/**
 * A link's token (TS-32): the HMAC-SHA256 of its ID under the server secret, 256 bits in base64url. Derived rather
 * than stored, so the owner can see the link again while the database holds only its hash (decided with the creator,
 * 29 October 2026). Rotating the secret changes every token, so every link stops working.
 */
export async function shareToken(secret: string, linkId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`tonaris:share-link:${linkId}`));
  return base64url(new Uint8Array(mac));
}

/** The SHA-256 of a link token, which is all that is stored and looked up (TS-32). */
export async function shareTokenHash(token: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
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

/** `share.invite`'s arguments: the grant's ID, chosen by the client (TS-10), and the address as typed. */
export const shareInviteArgsSchema = z.object({
  grantId: z.uuid({ version: "v7" }),
  containerId: z.uuid(),
  email: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .meta({ description: "The address to invite, as typed." }),
});

/** `share.setLink`'s arguments: on or off, and the new link's ID, used only when one is made (TS-10). */
export const shareSetLinkArgsSchema = z.object({
  containerId: z.uuid(),
  linkId: z.uuid({ version: "v7" }).meta({
    description:
      "The ID a new link gets. Ignored when a link is on already, or when turning it off.",
  }),
  enabled: z.boolean(),
});

/** `account.setDisplayName`'s arguments: null or blank clears it. */
export const setDisplayNameArgsSchema = z.object({
  displayName: z.string().max(maxNameLength).nullable(),
});

/** What `share.invite` reports: the person's invitation, new or the one they had (FR-07.5). */
export const shareInviteResultSchema = z.object({
  grantId: z.uuid(),
  status: z.enum(["pending", "accepted"]),
});

/** What `share.setLink` reports: the live link's ID, or null once it is off. */
export const shareSetLinkResultSchema = z.object({ linkId: z.uuid().nullable() });

const recipientNotFound =
  "No Tonaris account uses this email. Invitations only work for existing members — you can share a link instead.";
const displayNameRequired = "Add a display name before sharing.";

/** The folder or list the principal may share, or why not: theirs, in the app (X-03), and not in Trash. */
async function shareable(
  containerId: string,
  { principal, store }: CommandContext,
  { evenInTrash = false } = {},
) {
  const container = await store.findContainer(containerId);
  if (!container) return failure("not_found", "This folder or list doesn't exist.");
  const decision = authorizeWrite(principal, { ownerId: container.ownerId, scope: "sharing" });
  if (!decision.allowed)
    return failure(decision.code, "Only its owner can share this, in the app.");
  if (container.trashed && !evenInTrash) {
    return failure("trashed", "This folder or list is in Trash. Recover it to share it.");
  }
  return container;
}

/** Whether the owner has a display name to share under (FR-11.3, TS-34). */
const named = async ({ store }: CommandContext, ownerId: string) =>
  !isBlankName((await store.displayNameOf(ownerId)) ?? "");

/**
 * `share.invite` (FR-07.4, FR-07.5): a pending invitation for the account that signs in with `email`. Nobody without an
 * account is invited, nor is an account or admission made for them (X-05). Someone already invited or viewing keeps
 * the invitation they have. Email and the inbox arrive with TON-66.
 */
export async function inviteToShare(
  { grantId, containerId, email }: z.infer<typeof shareInviteArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const container = await shareable(containerId, context);
  if ("status" in container) return container;
  if (!(await named(context, container.ownerId))) {
    return failure("display_name_required", displayNameRequired);
  }
  const recipient = await context.store.findAccountByEmail(emailKey(email));
  if (!recipient) {
    return failure("recipient_not_found", recipientNotFound, [
      { path: "args.email", message: "No account uses this email" },
    ]);
  }
  if (recipient.id === container.ownerId) {
    return failure("validation_failed", "You can't invite yourself.", [
      { path: "args.email", message: "This is your own email" },
    ]);
  }
  const open = await context.store.findOpenGrant(containerId, recipient.id);
  if (open)
    return { status: "applied", changes: [], result: { grantId: open.id, status: open.status } };
  await context.store.insertGrant({
    id: grantId,
    containerId,
    granteeId: recipient.id,
    invitedEmail: email.trim(),
    status: "pending",
  });
  return { status: "applied", changes: [], result: { grantId, status: "pending" } };
}

/**
 * `share.setLink` (FR-07.1, FR-07.16): turning on keeps the live link, or makes one whose token's hash the API
 * prepared (TS-32); turning off revokes it for good, so turning on again makes a new link. Turning off works in
 * Trash too: a revocation made meanwhile stays in effect (FR-07.10).
 */
export async function setShareLink(
  { containerId, linkId, enabled }: z.infer<typeof shareSetLinkArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const container = await shareable(containerId, context, { evenInTrash: !enabled });
  if ("status" in container) return container;
  const live = await context.store.findLiveLink(containerId);
  if (!enabled) {
    if (live) await context.store.revokeLink(live.id, context.now ?? new Date());
    return { status: "applied", changes: [], result: { linkId: null } };
  }
  if (!(await named(context, container.ownerId))) {
    return failure("display_name_required", displayNameRequired);
  }
  if (live) return { status: "applied", changes: [], result: { linkId: live.id } };
  const hash = context.shareLink?.hash;
  if (!hash) return failure("internal_error", "The link couldn't be made.");
  await context.store.insertLink({ id: linkId, containerId, tokenHash: hash });
  return { status: "applied", changes: [], result: { linkId } };
}

/**
 * `account.setDisplayName` (FR-11.3, TS-34): trimmed, and blank clears it, except while the account shares anything:
 * a pending or accepted invitation, or a link that is on (AC-38). App-only (X-03).
 */
export async function setDisplayName(
  { displayName }: z.infer<typeof setDisplayNameArgsSchema>,
  { principal, store }: CommandContext,
): Promise<CommandResult> {
  const userId = actingUserId(principal);
  if (userId === undefined) return failure("permission_denied", "Sign in to change your name.");
  const decision = authorizeWrite(principal, { ownerId: userId, scope: "account" });
  if (!decision.allowed) return failure(decision.code, "Your display name is changed in the app.");
  const name = displayName?.trim() ?? "";
  if (name === "" && (await store.activeShareCount(userId)) > 0) {
    return failure(
      "display_name_required",
      "People you share with see your display name. Stop sharing to clear it.",
      [{ path: "args.displayName", message: "Required while you share" }],
    );
  }
  await store.setDisplayName(userId, name === "" ? null : name);
  return { status: "applied", changes: [], result: { displayName: name === "" ? null : name } };
}

/** What the sharing dialog shows the owner (DS-65): invitations, the link, and access from folders above. */
export const shareSettingsSchema = z
  .object({
    containerId: z.uuid(),
    ownerDisplayName: z
      .string()
      .nullable()
      .meta({ description: "The owner's display name; sharing needs one (FR-11.3)." }),
    invitations: z
      .array(
        z.object({
          id: z.uuid(),
          email: z.string().meta({ description: "The address as the owner typed it." }),
          displayName: z
            .string()
            .nullable()
            .meta({ description: "The person's display name, if they set one." }),
          status: z.enum(["pending", "accepted"]),
          emailStatus: z.enum(emailStatuses).nullable(),
        }),
      )
      .meta({ description: "Pending and accepted invitations, oldest first." }),
    link: z
      .object({ id: z.uuid(), url: z.string() })
      .nullable()
      .meta({ description: "The link that is on, if any; the same URL every time (TS-32)." }),
    inherited: z
      .array(
        z.object({
          containerId: z.uuid(),
          name: z.string(),
          people: z.int().min(0).meta({ description: "Its pending and accepted invitations." }),
          link: z.boolean().meta({ description: "Whether its link is on." }),
        }),
      )
      .meta({ description: "Folders above that are shared, nearest first (FR-07.8)." }),
  })
  .meta({ description: "A folder's or list's sharing, for its owner (DS-65)." });
export type ShareSettings = z.infer<typeof shareSettingsSchema>;
