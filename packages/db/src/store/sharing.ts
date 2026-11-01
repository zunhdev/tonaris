// The store's accounts and sharing (TS-31–TS-33; FR-07): display names, grants and their ends, saved references,
// and links, with what the person may read through them.

import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { endedGrantStatuses, openGrantStatuses, type CollectionStore } from "@tonaris/domain";

import { canReadContainer, linkByTokenHash } from "../access";
import type { Transaction } from "../client";
import { recordInLedger } from "../ledger";
import { containers, savedReferences, shareGrants, shareLinks, users } from "../schema";

/** Accounts, grants, references and links, on `tx`. */
export function sharingStore(tx: Transaction) {
  return {
    canReadShared(personId, containerId) {
      return canReadContainer(tx, { kind: "person", userId: personId }, containerId);
    },
    async findAccountByEmail(key) {
      const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.email, key));
      return account;
    },
    async displayNameOf(userId) {
      const [account] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId));
      return account?.displayName ?? null;
    },
    async setDisplayName(userId, displayName) {
      await tx.update(users).set({ displayName }).where(eq(users.id, userId));
    },
    async activeShareCount(ownerId) {
      const owned = tx
        .select({ id: containers.id })
        .from(containers)
        .where(eq(containers.ownerId, ownerId));
      const [grants] = await tx
        .select({ count: count() })
        .from(shareGrants)
        .where(
          and(
            inArray(shareGrants.containerId, owned),
            inArray(shareGrants.status, [...openGrantStatuses]),
          ),
        );
      const [links] = await tx
        .select({ count: count() })
        .from(shareLinks)
        .where(and(inArray(shareLinks.containerId, owned), isNull(shareLinks.revokedAt)));
      return (grants?.count ?? 0) + (links?.count ?? 0);
    },
    async findOpenGrant(containerId, granteeId) {
      const [grant] = await tx
        .select({ id: shareGrants.id, status: shareGrants.status })
        .from(shareGrants)
        .where(
          and(
            eq(shareGrants.containerId, containerId),
            eq(shareGrants.granteeId, granteeId),
            inArray(shareGrants.status, [...openGrantStatuses]),
          ),
        );
      return grant;
    },
    async insertGrant(grant) {
      await tx.insert(shareGrants).values(grant);
    },
    async findGrant(id) {
      const [grant] = await tx
        .select({
          id: shareGrants.id,
          status: shareGrants.status,
          containerId: shareGrants.containerId,
          granteeId: shareGrants.granteeId,
        })
        .from(shareGrants)
        .where(eq(shareGrants.id, id));
      return grant;
    },
    async moveGrant(id, from, to) {
      const moved = await tx
        .update(shareGrants)
        .set({ status: to })
        .where(and(eq(shareGrants.id, id), eq(shareGrants.status, from)))
        .returning({ id: shareGrants.id });
      // An ended grant stays ended after a restore (TS-113).
      const ended = endedGrantStatuses.find((status) => status === to);
      if (moved.length > 0 && ended)
        await recordInLedger(tx, { type: "shareGrant.ended", grantId: id, status: ended });
      return moved.length > 0;
    },
    async setGrantEmailStatus(id, status) {
      await tx.update(shareGrants).set({ emailStatus: status }).where(eq(shareGrants.id, id));
    },
    async dropGrantReference(viewerId, containerId) {
      const dropped = await tx
        .delete(savedReferences)
        .where(
          and(
            eq(savedReferences.viewerId, viewerId),
            eq(savedReferences.containerId, containerId),
            isNull(savedReferences.linkId),
          ),
        )
        .returning({ containerId: savedReferences.containerId });
      return dropped.length > 0;
    },
    async saveReference(viewerId, containerId, linkId) {
      const where = and(
        eq(savedReferences.viewerId, viewerId),
        eq(savedReferences.containerId, containerId),
      );
      const [existing] = await tx
        .select({ linkId: savedReferences.linkId })
        .from(savedReferences)
        .where(where);
      if (!existing) {
        await tx.insert(savedReferences).values({ viewerId, containerId, linkId: linkId ?? null });
        return "inserted";
      }
      if (linkId === undefined || existing.linkId === linkId) return "unchanged";
      await tx.update(savedReferences).set({ linkId }).where(where);
      return "updated";
    },
    async removeReference(viewerId, containerId) {
      const removed = await tx
        .delete(savedReferences)
        .where(
          and(eq(savedReferences.viewerId, viewerId), eq(savedReferences.containerId, containerId)),
        )
        .returning({ containerId: savedReferences.containerId });
      return removed.length > 0;
    },
    findLinkByHash: (hash) => linkByTokenHash(tx, hash),
    async findLiveLink(containerId) {
      const [link] = await tx
        .select({ id: shareLinks.id })
        .from(shareLinks)
        .where(and(eq(shareLinks.containerId, containerId), isNull(shareLinks.revokedAt)));
      return link;
    },
    async insertLink({ id, containerId, tokenHash }) {
      await tx.insert(shareLinks).values({ id, containerId, tokenHash: Buffer.from(tokenHash) });
    },
    async revokeLink(id, at) {
      await tx.update(shareLinks).set({ revokedAt: at }).where(eq(shareLinks.id, id));
      await recordInLedger(tx, { type: "shareLink.revoked", linkId: id }, at);
    },
  } satisfies Partial<CollectionStore>;
}
