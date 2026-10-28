// Share links, person-to-person grants and saved references (TS-11, TS-32, TS-33; FR-07).
// Grantee and viewer columns reference `user` with NO ACTION, like owner columns (TS-74).

import { sql } from "drizzle-orm";
import { bytea, check, index, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { emailStatuses, shareGrantStatuses } from "@tonaris/domain";

import { users } from "./auth";
import { containers } from "./collection";
import { instant, oneOf, table, timestamps } from "./columns";

/** A container's public link. Only the SHA-256 of the token is stored; at most one link is active (FR-07.16). */
export const shareLinks = table(
  "share_links",
  {
    id: uuid().primaryKey(),
    containerId: uuid()
      .notNull()
      .references(() => containers.id, { onDelete: "cascade" }),
    tokenHash: bytea().notNull().unique(),
    revokedAt: instant(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("share_links_active_key")
      .on(t.containerId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

export { emailStatuses, shareGrantStatuses };

/** Invitations to view a container; delivery is tracked apart from the grant's status (TS-33). */
export const shareGrants = table(
  "share_grants",
  {
    id: uuid().primaryKey(),
    containerId: uuid()
      .notNull()
      .references(() => containers.id, { onDelete: "cascade" }),
    granteeId: uuid()
      .notNull()
      .references(() => users.id),
    // The address the owner typed, which their dialog shows (DS-65, DS-69); the grantee's may change later.
    invitedEmail: text().notNull(),
    status: text({ enum: shareGrantStatuses }).notNull(),
    emailStatus: text({ enum: emailStatuses }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("share_grants_open_key")
      .on(t.containerId, t.granteeId)
      .where(sql`${t.status} in ('pending', 'accepted')`),
    index().on(t.containerId),
    index().on(t.granteeId),
    check("share_grants_status_check", oneOf(t.status, shareGrantStatuses)),
    check("share_grants_email_status_check", oneOf(t.emailStatus, emailStatuses)),
  ],
);

/** Shared with me = accepted grants ∪ these references, deduplicated by container (FR-07.13). */
export const savedReferences = table(
  "saved_references",
  {
    viewerId: uuid()
      .notNull()
      .references(() => users.id),
    containerId: uuid()
      .notNull()
      .references(() => containers.id, { onDelete: "cascade" }),
    // Null when the reference comes only from a grant.
    linkId: uuid().references(() => shareLinks.id),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.viewerId, t.containerId] }), index().on(t.containerId)],
);
