// Account changes (TS-73): a sign-in email change in progress, a creator's recovery waiting for the new address,
// and the audit log (TS-11), which records admin actions, recovery and deletions.

import { sql } from "drizzle-orm";
import { boolean, bytea, check, index, jsonb, smallint, text, uuid } from "drizzle-orm/pg-core";

import { auditActions, emailChangeStages } from "@tonaris/domain";

import { users } from "./auth";
import { instant, oneOf, table, timestamps } from "./columns";

/**
 * One change per account (FR-11.4): starting again replaces it, cancelling deletes it, and the swap deletes it.
 * Only the code's SHA-256 is kept.
 */
export const emailChanges = table(
  "email_changes",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // The new address as its email key (TS-70).
    newEmailKey: text().notNull(),
    // Whose code is asked for: the current address's, then the new one's.
    stage: text({ enum: emailChangeStages }).notNull(),
    codeHash: bytea().notNull(),
    // Wrong codes entered for this code; at signInCode.attempts it stops working.
    attempts: smallint().notNull().default(0),
    expiresAt: instant().notNull(),
    ...timestamps,
  },
  (t) => [
    check("email_changes_stage_check", oneOf(t.stage, emailChangeStages)),
    check("email_changes_attempts_check", sql`${t.attempts} >= 0`),
  ],
);

/**
 * A creator's recovery of an account's sign-in email (FR-11.5), until the new address confirms it. One per account:
 * a new request replaces it, and cancelling or confirming deletes it. A deleted account takes it along, so a
 * deleted account is never recovered. Only hashes of the link's token and the code are kept.
 */
export const emailRecoveries = table(
  "email_recoveries",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    newEmailKey: text().notNull(),
    tokenHash: bytea().notNull().unique(),
    codeHash: bytea().notNull(),
    attempts: smallint().notNull().default(0),
    expiresAt: instant().notNull(),
    // Why the creator recovers it, for the audit log.
    reason: text().notNull(),
    // Whether confirming also disconnects the account's AI connections (TS-73).
    disconnectConnections: boolean().notNull(),
    // The creator who asked; no foreign key, as in the audit log.
    requestedBy: uuid().notNull(),
    ...timestamps,
  },
  (t) => [check("email_recoveries_attempts_check", sql`${t.attempts} >= 0`)],
);

/**
 * What was done to an account, by whom (TS-11). Actor and subject carry no foreign key, so a record outlives a
 * deleted account (FR-11.11).
 */
export const auditLog = table(
  "audit_log",
  {
    id: uuid().primaryKey(),
    actor: uuid(),
    action: text({ enum: auditActions }).notNull(),
    subject: uuid().notNull(),
    details: jsonb().notNull(),
    at: instant().notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_subject_idx").on(t.subject, t.at),
    check("audit_log_action_check", oneOf(t.action, auditActions)),
  ],
);
