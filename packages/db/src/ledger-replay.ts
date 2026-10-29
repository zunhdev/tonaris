// A restore's reconciliation (TS-113, Q-04): the ledger's events newer than the backup, applied in order to the
// restored database before it serves anyone, so a deleted account, a revoked connection, link, grant or admission,
// and a purged Trash unit stay gone. Each event is applied as its change was, and applying it again changes nothing.

import { and, eq, inArray, isNull } from "drizzle-orm";

import type { LedgerEvent } from "@tonaris/domain";

import { deleteAccountData, endAccountAccess } from "./account-deletion";
import type { Database } from "./client";
import {
  admissionInvitations,
  albums,
  containers,
  oauthAccessTokens,
  oauthConsents,
  oauthRefreshTokens,
  positions,
  shareGrants,
  shareLinks,
  trashUnits,
  users,
} from "./schema";

export type ReplayReport = Record<LedgerEvent["type"], number>;

/** Applies `events` to `db` in the order they happened, and counts them by type. */
export async function replayLedger(
  db: Database,
  events: readonly LedgerEvent[],
): Promise<ReplayReport> {
  const report: ReplayReport = {
    "account.deleted": 0,
    "connection.revoked": 0,
    "shareLink.revoked": 0,
    "shareGrant.ended": 0,
    "trash.purged": 0,
    "admission.revoked": 0,
  };
  for (const event of events.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    // oxlint-disable-next-line no-await-in-loop -- in the order they happened
    await apply(db, event);
    report[event.type] += 1;
  }
  return report;
}

async function apply(db: Database, event: LedgerEvent): Promise<void> {
  const at = new Date(event.at);
  switch (event.type) {
    case "account.deleted": {
      const [account] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, event.userId));
      if (!account) return;
      await db.transaction((tx) => endAccountAccess(tx, event.userId, at));
      await deleteAccountData(db, event.userId);
      return;
    }
    case "connection.revoked": {
      const mine = (
        table: typeof oauthAccessTokens | typeof oauthRefreshTokens | typeof oauthConsents,
      ) =>
        event.clientId === null
          ? eq(table.userId, event.userId)
          : and(eq(table.userId, event.userId), eq(table.clientId, event.clientId));
      await db.transaction(async (tx) => {
        await tx.delete(oauthAccessTokens).where(mine(oauthAccessTokens));
        await tx.delete(oauthRefreshTokens).where(mine(oauthRefreshTokens));
        await tx.delete(oauthConsents).where(mine(oauthConsents));
      });
      return;
    }
    case "shareLink.revoked":
      await db
        .update(shareLinks)
        .set({ revokedAt: at })
        .where(and(eq(shareLinks.id, event.linkId), isNull(shareLinks.revokedAt)));
      return;
    case "shareGrant.ended":
      await db
        .update(shareGrants)
        .set({ status: event.status })
        .where(
          and(
            eq(shareGrants.id, event.grantId),
            inArray(shareGrants.status, ["pending", "accepted"]),
          ),
        );
      return;
    case "trash.purged":
      await db.transaction(async (tx) => {
        if (event.containerIds.length > 0)
          await tx.delete(containers).where(inArray(containers.id, event.containerIds));
        if (event.albumIds.length > 0) {
          await tx.delete(positions).where(inArray(positions.itemId, event.albumIds));
          await tx.delete(albums).where(inArray(albums.id, event.albumIds));
        }
        await tx.delete(trashUnits).where(eq(trashUnits.id, event.unitId));
      });
      return;
    case "admission.revoked":
      await db
        .update(admissionInvitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(admissionInvitations.id, event.invitationId),
            eq(admissionInvitations.status, "available"),
          ),
        );
      return;
  }
}
