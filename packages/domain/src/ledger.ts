// The revocation ledger's events (TS-113, Q-04): every deletion-class change, written off-site as it happens, so a
// restored backup can be brought forward past it. Only IDs: no names, titles or addresses. A restore replays the
// events newer than the backup, so a deleted account, a revoked connection, link or grant, a purged Trash unit, a
// revoked admission or a removed passkey never comes back.

import { z } from "./zod";

/** The queued job that appends an event to the ledger (TS-90), retried until it lands. */
export const ledgerJobKind = "ledger.append";

const at = z.iso.datetime().meta({ description: "When it happened." });
const base = {
  id: z.uuid().meta({ description: "The event's UUIDv7, in the order they happened." }),
  at,
};

export const ledgerEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("account.deleted"), userId: z.uuid() }),
  z.object({
    ...base,
    type: z.literal("connection.revoked"),
    userId: z.uuid(),
    clientId: z
      .string()
      .nullable()
      .meta({ description: "The client; null for every one of the person's." }),
  }),
  z.object({ ...base, type: z.literal("shareLink.revoked"), linkId: z.uuid() }),
  z.object({
    ...base,
    type: z.literal("shareGrant.ended"),
    grantId: z.uuid(),
    status: z.enum(["declined", "withdrawn", "revoked"]),
  }),
  z.object({
    ...base,
    type: z.literal("trash.purged"),
    unitId: z.uuid(),
    containerIds: z.array(z.uuid()),
    albumIds: z.array(z.uuid()),
  }),
  z.object({ ...base, type: z.literal("admission.revoked"), invitationId: z.uuid() }),
  z.object({
    ...base,
    type: z.literal("passkey.removed"),
    userId: z.uuid(),
    passkeyId: z
      .uuid()
      .nullable()
      .meta({ description: "The passkey; null for every one of the person's." }),
  }),
]);
export type LedgerEvent = z.infer<typeof ledgerEventSchema>;

/** An event as its change records it; the ledger gives it its ID and time. */
export type LedgerEntry = LedgerEvent extends infer Each
  ? Each extends LedgerEvent
    ? Omit<Each, "id" | "at">
    : never
  : never;
