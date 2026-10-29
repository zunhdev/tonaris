// Account changes (TS-73): a sign-in email change in progress, and the audit log (TS-11), which records admin
// actions, recovery and deletions.

import { sql } from "drizzle-orm";
import { bytea, check, index, jsonb, smallint, text, uuid } from "drizzle-orm/pg-core";

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
