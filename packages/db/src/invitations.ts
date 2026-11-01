// Invitations from their recipient's side and their email (FR-07.5, FR-07.6; DS-66, TS-33, TS-72): the pending
// invitations to active collections, one invitation's state for the email's page, and what delivering one needs,
// with how it went recorded on the grant.

import { aliasedTable, and, asc, eq, isNull } from "drizzle-orm";

import {
  invitationStateFor,
  type EmailStatus,
  type Invitation,
  type InvitationState,
} from "@tonaris/domain";

import type { Database } from "./client";
import { containers, shareGrants, users } from "./schema";

const owners = aliasedTable(users, "owners");

const invitationColumns = {
  id: shareGrants.id,
  status: shareGrants.status,
  granteeId: shareGrants.granteeId,
  createdAt: shareGrants.createdAt,
  ownerName: owners.displayName,
  containerId: containers.id,
  containerName: containers.name,
  kind: containers.kind,
  trashedAt: containers.trashedAt,
};

type InvitationRow = {
  id: string;
  createdAt: Date;
  ownerName: string | null;
  containerId: string;
  containerName: string;
  kind: "folder" | "list";
};

const invitationOf = (row: InvitationRow): Invitation => ({
  id: row.id,
  owner: { displayName: row.ownerName },
  container: { id: row.containerId, name: row.containerName, kind: row.kind },
  invitedAt: row.createdAt.toISOString(),
});

/** The person's pending invitations whose collection is active, oldest first (DS-66). */
export async function pendingInvitations(db: Database, userId: string): Promise<Invitation[]> {
  const rows = await db
    .select(invitationColumns)
    .from(shareGrants)
    .innerJoin(containers, eq(containers.id, shareGrants.containerId))
    .innerJoin(owners, eq(owners.id, containers.ownerId))
    .where(
      and(
        eq(shareGrants.granteeId, userId),
        eq(shareGrants.status, "pending"),
        isNull(containers.trashedAt),
      ),
    )
    .orderBy(asc(shareGrants.id));
  return rows.map(invitationOf);
}

/** An invitation as its email's page shows it to `userId` (DS-66), as `invitationStateFor` decides. */
export async function invitationState(
  db: Database,
  userId: string,
  grantId: string,
): Promise<InvitationState> {
  const [row] = await db
    .select(invitationColumns)
    .from(shareGrants)
    .innerJoin(containers, eq(containers.id, shareGrants.containerId))
    .innerJoin(owners, eq(owners.id, containers.ownerId))
    .where(eq(shareGrants.id, grantId));
  return invitationStateFor(
    userId,
    row && {
      status: row.status,
      granteeId: row.granteeId,
      trashed: row.trashedAt !== null,
      invitation: invitationOf(row),
    },
  );
}

/** What emailing a pending invitation marked for sending needs: the recipient's current address and the names. */
export async function invitationToDeliver(
  db: Database,
  grantId: string,
): Promise<
  | { to: string; ownerName: string | null; containerName: string; kind: "folder" | "list" }
  | undefined
> {
  const [row] = await db
    .select({
      to: users.email,
      ownerName: owners.displayName,
      containerName: containers.name,
      kind: containers.kind,
    })
    .from(shareGrants)
    .innerJoin(users, eq(users.id, shareGrants.granteeId))
    .innerJoin(containers, eq(containers.id, shareGrants.containerId))
    .innerJoin(owners, eq(owners.id, containers.ownerId))
    .where(
      and(
        eq(shareGrants.id, grantId),
        eq(shareGrants.status, "pending"),
        eq(shareGrants.emailStatus, "sending"),
        isNull(containers.trashedAt),
      ),
    );
  return row;
}

/** Records how an invitation's email went, while it is still pending and sending (TS-33). */
export async function recordInvitationEmail(
  db: Database,
  grantId: string,
  status: Exclude<EmailStatus, "sending">,
): Promise<void> {
  await db
    .update(shareGrants)
    .set({ emailStatus: status })
    .where(
      and(
        eq(shareGrants.id, grantId),
        eq(shareGrants.status, "pending"),
        eq(shareGrants.emailStatus, "sending"),
      ),
    );
}
