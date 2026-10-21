// Admission (TS-71, TS-11): the creator's email-bound invitations, and the switch that pauses account creation.

import { sql } from "drizzle-orm";
import { boolean, bytea, check, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { admissionInvitationStatuses } from "@tonaris/domain";

import { users } from "./auth";
import { instant, oneOf, table, timestamps } from "./columns";
import { emailStatuses } from "./sharing";

export const admissionInvitations = table(
  "admission_invitations",
  {
    id: uuid().primaryKey(),
    // The invited address as its email key (TS-70): only this address can redeem it (FR-11.6).
    emailKey: text().notNull(),
    // SHA-256 of the link's token, like a share link's; the token itself is only ever in the invitation email.
    tokenHash: bytea().notNull().unique(),
    status: text({ enum: admissionInvitationStatuses }).notNull().default("available"),
    expiresAt: instant().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    // The account it created. A later account deletion leaves the redemption on record without it (TS-74).
    redeemedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    redeemedAt: instant(),
    // Sending is tracked apart from the invitation's status (FR-11.6, TS-72); null until sending starts.
    emailStatus: text({ enum: emailStatuses }),
    ...timestamps,
  },
  (t) => [
    // One available invitation per address, so admission finds at most one (TS-11).
    uniqueIndex("admission_invitations_available_email_key")
      .on(t.emailKey)
      .where(sql`${t.status} = 'available'`),
    check("admission_invitations_status_check", oneOf(t.status, admissionInvitationStatuses)),
    check("admission_invitations_email_status_check", oneOf(t.emailStatus, emailStatuses)),
    check(
      "admission_invitations_redeemed_check",
      sql`(${t.status} = 'redeemed') = (${t.redeemedAt} is not null)`,
    ),
  ],
);

/** Service-wide switches: one row, created by its migration. */
export const serviceState = table(
  "service_state",
  {
    id: smallint().primaryKey().default(1),
    // While true, no account is created; admitted users keep their access (FR-11.2, FR-11.6).
    admissionsPaused: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [check("service_state_singleton_check", sql`${t.id} = 1`)],
);
