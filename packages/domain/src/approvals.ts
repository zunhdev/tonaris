// Verifiable approvals for MCP's gated operations (TS-64, FR-10.6). A gated tool computes the exact scope of
// what it would do; the owner approves that scope in Tonaris, and the operation runs only while its recomputed
// scope still hashes the same. An agent's claim that the owner approved is never enough.

import { z } from "./zod";

/** Stored statuses. Expiry is derived from `expiresAt`, so an approved but unused approval also expires. */
export const approvalStatuses = ["pending", "approved", "declined", "used"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

/** What the approval page and agents see: the stored status, or `expired` once past `expiresAt`. */
export const approvalStates = [...approvalStatuses, "expired"] as const;
export type ApprovalState = (typeof approvalStates)[number];

/** The gated operations. TON-23 prototypes album deletion; TS-63's others arrive with M9. */
export const approvalOperations = ["delete_albums"] as const;
export type ApprovalOperation = (typeof approvalOperations)[number];

/** An approval is answered within 30 minutes (TS-64), then the agent asks again. */
export const approvalValidMinutes = 30;

/** Deleted albums stay recoverable in Trash for 30 days (FR-14.1, FR-14.5). */
export const trashRetentionDays = 30;

const listRefSchema = z.object({ id: z.uuid(), name: z.string() });

/**
 * Deleting albums into Trash (FR-14.1): the albums, and the active lists each one leaves. An album added to
 * another list after the approval grows the scope, so it needs a new approval (FR-10.6).
 */
export const albumDeletionScopeSchema = z
  .object({
    operation: z.literal("delete_albums"),
    albums: z.array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        artist: z.string(),
        lists: z.array(listRefSchema),
      }),
    ),
    recoverableDays: z.int(),
  })
  .meta({ description: "Albums moved to Trash, with the lists they leave (FR-14.1)." });
export type AlbumDeletionScope = z.infer<typeof albumDeletionScopeSchema>;

export type ApprovalScope = AlbumDeletionScope;

/** An album to delete, as storage reads it: active, owned, with its active lists. */
export type AlbumDeletionTarget = AlbumDeletionScope["albums"][number];

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The scope of deleting `targets`, in a canonical order so the same deletion always hashes the same. */
export function albumDeletionScope(targets: readonly AlbumDeletionTarget[]): AlbumDeletionScope {
  return {
    operation: "delete_albums",
    albums: targets
      .map(({ id, title, artist, lists }) => ({ id, title, artist, lists: lists.toSorted(byId) }))
      .toSorted(byId),
    recoverableDays: trashRetentionDays,
  };
}

/** JSON with object keys sorted at every level: the canonical form a scope is hashed in. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * `sha256(canonical(scope))` in hex (TS-64), with Web Crypto, which Bun and browsers share. Approvals and in-app
 * confirmations, such as removing a chosen option, hash their scopes alike (TS-14).
 */
export async function scopeHash(scope: object): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(scope)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The summary sentence (DS-87), which the agent also relays to the owner: "Move 2 albums to Trash". */
export function approvalSummary(scope: ApprovalScope): string {
  return `Move ${count(scope.albums.length, "album", "albums")} to Trash`;
}

/** What happens, and whether it can be undone (X-07, DS-87). */
export function approvalConsequences(scope: ApprovalScope): string[] {
  const lists = new Set(scope.albums.flatMap((album) => album.lists.map((list) => list.id)));
  return [
    lists.size === 0
      ? "They leave Unsorted."
      : `They leave ${count(lists.size, "list", "lists")} and Unsorted.`,
    `They can be recovered from Trash for ${scope.recoverableDays} days.`,
  ];
}

/** The state an approval is in at `now`. */
export function approvalState(
  approval: { status: ApprovalStatus; expiresAt: Date },
  now = new Date(),
): ApprovalState {
  if (approval.status === "declined" || approval.status === "used") return approval.status;
  return approval.expiresAt.getTime() <= now.getTime() ? "expired" : approval.status;
}

/** An approval as its owner sees it (`GET /v1/approvals/{id}`, DS-87). */
export const approvalSchema = z
  .object({
    id: z.uuid(),
    state: z.enum(approvalStates),
    clientName: z
      .string()
      .nullable()
      .meta({ description: "The connection's client, as it named itself (DS-85)." }),
    summary: z.string(),
    consequences: z.array(z.string()),
    scope: albumDeletionScopeSchema,
    expiresAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
  })
  .meta({
    description: "A gated MCP operation waiting for, or given, the owner's decision (TS-64).",
  });
export type Approval = z.infer<typeof approvalSchema>;

export const approvalDecisionSchema = z
  .object({ decision: z.enum(["approve", "decline"]) })
  .meta({ description: "The owner's decision on a pending approval." });
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
