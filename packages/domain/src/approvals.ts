// Verifiable approvals for MCP's gated operations (TS-64, FR-10.6). A gated tool computes the exact scope of
// what it would do; the owner approves that scope in Tonaris, and the operation runs only while its recomputed
// scope still hashes the same. An agent's claim that the owner approved is never enough.

import { containerKinds } from "./containers";
import type { FieldDeletion } from "./field-deletion";
import type { OptionRemoval } from "./field-options";
import { fieldTypes, type FieldType } from "./fields";
import { trashRetentionDays } from "./limits";
import { audienceSchema, type Audience } from "./sharing-impact";
import { z } from "./zod";

/** Stored statuses. Expiry is derived from `expiresAt`, so an approved but unused approval also expires. */
export const approvalStatuses = ["pending", "approved", "declined", "used"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

/** What the approval page and agents see: the stored status, or `expired` once past `expiresAt`. */
export const approvalStates = [...approvalStatuses, "expired"] as const;
export type ApprovalState = (typeof approvalStates)[number];

/**
 * The gated operations (FR-10.6): deleting into Trash, permanently deleting a field, removing options albums choose,
 * and confirming an uncertain match. `delete_albums` is TON-23's, kept for approvals made before `delete_items`.
 */
export const approvalOperations = [
  "delete_albums",
  "delete_items",
  "delete_field",
  "remove_options",
  "confirm_match",
] as const;
export type ApprovalOperation = (typeof approvalOperations)[number];

/** An approval is answered within 30 minutes (TS-64), then the agent asks again. */
export const approvalValidMinutes = 30;

const listRefSchema = z.object({ id: z.uuid(), name: z.string() });

const albumTargetSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  artist: z.string(),
  lists: z.array(listRefSchema),
});

/**
 * What a gated operation does, in canonical order so the same operation always hashes the same (TS-64). One shape for
 * every operation, its parts optional, so the approval page and agents read them alike. A scope that grows after the
 * owner approved, such as an album joining another list or a field gaining albums, hashes differently, so it needs a
 * new approval (FR-10.6).
 */
export const approvalScopeSchema = z
  .object({
    operation: z.enum(approvalOperations),
    albums: z.array(albumTargetSchema).meta({
      description:
        "Albums it moves to Trash, each with the active lists it leaves; for a match, the saved album the link joins.",
    }),
    recoverableDays: z.int().meta({
      description: "How long Trash keeps what it deletes; 0 when it can't be undone.",
    }),
    containers: z
      .array(
        z.object({
          id: z.uuid(),
          kind: z.enum(containerKinds),
          name: z.string(),
          folders: z.int().meta({ description: "Folders inside it, which go with it." }),
          lists: z.int().meta({ description: "Lists inside it, which go with it." }),
        }),
      )
      .optional()
      .meta({ description: "Folders and lists it moves to Trash with everything inside." }),
    unsorted: z.int().optional().meta({
      description: "Albums in the deleted lists that are in no other list, so go to Unsorted.",
    }),
    sharing: z
      .array(audienceSchema)
      .optional()
      .meta({ description: "Who sees it now and no longer will (FR-07.14)." }),
    field: z
      .object({
        id: z.uuid(),
        name: z.string(),
        type: z.enum(fieldTypes),
        albums: z.int().meta({ description: "Albums outside Trash affected." }),
        inTrash: z.int().meta({ description: "Albums in Trash affected." }),
      })
      .optional()
      .meta({ description: "The field deleted, or whose options are removed." }),
    options: z
      .array(
        z.object({
          id: z.uuid(),
          label: z.string(),
          albums: z.int().meta({ description: "Albums outside Trash choosing it." }),
          inTrash: z.int().meta({ description: "Albums in Trash choosing it." }),
        }),
      )
      .optional()
      .meta({ description: "The options removed." }),
    checks: z.array(z.string()).optional().meta({
      description:
        "The in-app confirmations' scope hashes (TS-14), so a field or option gaining or losing an album needs a new approval.",
    }),
    match: z
      .object({
        link: z.string(),
        releaseGroupId: z.uuid(),
        title: z.string().meta({ description: "The MusicBrainz album the agent chose." }),
        listId: z.uuid().nullable(),
        listName: z.string().nullable(),
      })
      .optional()
      .meta({ description: "The link, the album it is confirmed as, and where it goes." }),
  })
  .meta({ description: "What a gated operation does (FR-10.6, TS-64)." });
export type ApprovalScope = z.infer<typeof approvalScopeSchema>;

/** An album to delete, as storage reads it: active, owned, with its active lists. */
export type AlbumDeletionTarget = z.infer<typeof albumTargetSchema>;

/** TON-23's album deletion: an approval scope of albums only. */
export type AlbumDeletionScope = ApprovalScope;

/** The folders and lists, and the albums, an approval names, as storage reads them. */
export type DeletionTargets = {
  albums: readonly AlbumDeletionTarget[];
  containers: readonly NonNullable<ApprovalScope["containers"]>[number][];
  unsorted: number;
  sharing: readonly Audience[];
};

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const sortedAlbums = (albums: readonly AlbumDeletionTarget[]) =>
  albums
    .map(({ id, title, artist, lists }) => ({ id, title, artist, lists: lists.toSorted(byId) }))
    .toSorted(byId);

/** The scope of deleting `targets` (TON-23's tool). */
export function albumDeletionScope(targets: readonly AlbumDeletionTarget[]): ApprovalScope {
  return {
    operation: "delete_albums",
    albums: sortedAlbums(targets),
    recoverableDays: trashRetentionDays,
  };
}

const audienceKey = (audience: Audience) =>
  audience.kind === "person" ? `person:${audience.id}` : `link:${audience.via.id}`;

/** The scope of `delete_items`: folders and lists with what's inside, and albums, to Trash (FR-01.11, FR-14.1). */
export function itemsDeletionScope(targets: DeletionTargets): ApprovalScope {
  return {
    operation: "delete_items",
    albums: sortedAlbums(targets.albums),
    recoverableDays: trashRetentionDays,
    containers: targets.containers.map((container) => ({ ...container })).toSorted(byId),
    unsorted: targets.unsorted,
    sharing: targets.sharing.toSorted((a, b) =>
      audienceKey(a) < audienceKey(b) ? -1 : audienceKey(a) > audienceKey(b) ? 1 : 0,
    ),
  };
}

/** The scope of `delete_field`: the field and how many albums lose it, from its confirmation (FR-03.18). */
export function fieldDeletionApprovalScope(deletion: FieldDeletion): ApprovalScope {
  return {
    operation: "delete_field",
    albums: [],
    recoverableDays: 0,
    field: { ...deletion.field, albums: deletion.albums, inTrash: deletion.inTrash },
    checks: [deletion.scopeHash],
  };
}

/** The scope of `remove_options`: the field's options and how many albums lose each (FR-03.17). */
export function optionsRemovalScope(
  field: { id: string; name: string; type: FieldType },
  removals: readonly OptionRemoval[],
): ApprovalScope {
  const sorted = removals.toSorted((a, b) => byId(a.option, b.option));
  return {
    operation: "remove_options",
    albums: [],
    recoverableDays: 0,
    field: {
      ...field,
      albums: sorted.reduce((sum, removal) => sum + removal.albums, 0),
      inTrash: sorted.reduce((sum, removal) => sum + removal.inTrash, 0),
    },
    options: sorted.map(({ option, albums, inTrash }) => ({ ...option, albums, inTrash })),
    checks: sorted.map((removal) => removal.scopeHash),
  };
}

/** The scope of `confirm_match`: the link, the album chosen, and the saved album it joins, if any (FR-02.9). */
export function matchScope(
  match: NonNullable<ApprovalScope["match"]>,
  saved: AlbumDeletionTarget | undefined,
): ApprovalScope {
  return {
    operation: "confirm_match",
    albums: saved ? sortedAlbums([saved]) : [],
    recoverableDays: 0,
    match,
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

/** "3 lists and 1 folder", from the parts that have any. */
const and = (parts: (string | false)[]) => {
  const named = parts.filter((part) => part !== false);
  return named.length <= 1
    ? (named[0] ?? "")
    : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
};

/**
 * The summary sentence (DS-87), which the agent also relays to the owner: "Move 3 lists and 1 folder (12 lists
 * inside) to Trash".
 */
export function approvalSummary(scope: ApprovalScope): string {
  if (scope.operation === "delete_field")
    return `Delete the field "${scope.field?.name ?? ""}" for good`;
  if (scope.operation === "remove_options") {
    const options = scope.options ?? [];
    const what =
      options.length === 1
        ? `the option "${options[0]?.label ?? ""}"`
        : count(options.length, "option", "options");
    return `Remove ${what} from "${scope.field?.name ?? ""}"`;
  }
  if (scope.operation === "confirm_match") {
    return `Add "${scope.match?.title ?? ""}" from this link`;
  }
  const containers = scope.containers ?? [];
  const lists = containers.filter((container) => container.kind === "list").length;
  const folders = containers.length - lists;
  const inside = containers.reduce((sum, container) => sum + container.lists, 0);
  const what = and([
    lists > 0 && count(lists, "list", "lists"),
    folders > 0 &&
      `${count(folders, "folder", "folders")}${inside > 0 ? ` (${count(inside, "list", "lists")} inside)` : ""}`,
    scope.albums.length > 0 && count(scope.albums.length, "album", "albums"),
  ]);
  return `Move ${what} to Trash`;
}

/** Who no longer sees it: "2 people and anyone with a link no longer see it." */
function sharingConsequence(sharing: readonly Audience[]): string | undefined {
  const people = sharing.filter((audience) => audience.kind === "person").length;
  const links = sharing.length - people;
  if (sharing.length === 0) return undefined;
  const who = and([
    people > 0 && count(people, "person it's shared with", "people it's shared with"),
    links > 0 && (links === 1 ? "anyone with its link" : `anyone with its ${links} links`),
  ]);
  return `${who.charAt(0).toUpperCase()}${who.slice(1)} will no longer see it.`;
}

/** What happens, and whether it can be undone (X-07, FR-10.6, DS-87). */
export function approvalConsequences(scope: ApprovalScope): string[] {
  if (scope.operation === "delete_field" || scope.operation === "remove_options") {
    const field = scope.field ?? { albums: 0, inTrash: 0 };
    const total = field.albums + field.inTrash;
    const albums = count(total, "album", "albums");
    const trash = field.inTrash > 0 ? `, ${field.inTrash} of them in Trash` : "";
    return [
      scope.operation === "delete_field"
        ? total === 0
          ? "No album uses it."
          : `It is taken off ${albums}${trash}, with its values.`
        : `${scope.options?.length === 1 ? "It is" : "They are"} cleared from ${albums}${trash}.`,
      "This can't be undone.",
    ];
  }
  if (scope.operation === "confirm_match") {
    const [saved] = scope.albums;
    const list = scope.match?.listName;
    return [
      saved
        ? `It is "${saved.title}" by ${saved.artist}, already in your collection: the link is added to it.`
        : "It is saved as a new album with this link.",
      ...(list ? [`It goes in the list "${list}".`] : []),
    ];
  }
  const consequences: string[] = [];
  if (scope.containers?.length) {
    const unsorted = scope.unsorted ?? 0;
    consequences.push(
      unsorted === 0
        ? "Albums in them stay in the collection, in their other lists."
        : `Albums in them stay in the collection: ${count(unsorted, "album is", "albums are")} in no other list, so go to Unsorted.`,
    );
  }
  if (scope.albums.length > 0) {
    const lists = new Set(scope.albums.flatMap((album) => album.lists.map((list) => list.id)));
    const they = scope.containers?.length ? "The albums" : "They";
    consequences.push(
      lists.size === 0
        ? `${they} leave Unsorted.`
        : `${they} leave ${count(lists.size, "list", "lists")} and Unsorted.`,
    );
  }
  const shared = sharingConsequence(scope.sharing ?? []);
  if (shared) consequences.push(shared);
  consequences.push(
    scope.containers?.length
      ? `Everything can be recovered from Trash for ${scope.recoverableDays} days.`
      : `They can be recovered from Trash for ${scope.recoverableDays} days.`,
  );
  return consequences;
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
    scope: approvalScopeSchema,
    expiresAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
  })
  .meta({
    description: "A gated MCP operation waiting for, or given, the owner's decision (TS-64).",
  });
export type Approval = z.infer<typeof approvalSchema>;

/** `GET /v1/approvals`: the requests waiting for the owner's decision (DS-86). */
export const pendingApprovalsSchema = z
  .object({
    approvals: z.array(
      z.object({
        id: z.uuid(),
        clientName: z.string().nullable(),
        summary: z.string(),
        expiresAt: z.iso.datetime(),
      }),
    ),
  })
  .meta({ description: "Approval requests waiting for a decision, oldest first." });
export type PendingApprovals = z.infer<typeof pendingApprovalsSchema>;

export const approvalDecisionSchema = z
  .object({ decision: z.enum(["approve", "decline"]) })
  .meta({ description: "The owner's decision on a pending approval." });
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
