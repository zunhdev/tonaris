// Approvals for MCP's gated operations (TS-64, TS-11), and agents' writes by idempotency key (TS-22). Each is bound to
// the connection that asked, so revoking the connection removes them. An approval is also bound to the hash of the
// exact scope the owner saw.

import { check, index, integer, jsonb, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { approvalOperations, approvalStatuses, type ApprovalScope } from "@tonaris/domain";

import { users } from "./auth";
import { instant, oneOf, table, timestamps } from "./columns";
import { oauthConsents } from "./oauth";

export const approvals = table(
  "approvals",
  {
    id: uuid().primaryKey(),
    accountId: uuid()
      .notNull()
      .references(() => users.id),
    // The connection (TS-30): only it may use the approval.
    grantId: uuid()
      .notNull()
      .references(() => oauthConsents.id, { onDelete: "cascade" }),
    operation: text({ enum: approvalOperations }).notNull(),
    // The tool's arguments, so the page and the agent see what was asked.
    args: jsonb().$type<Record<string, unknown>>().notNull(),
    scope: jsonb().$type<ApprovalScope>().notNull(),
    scopeHash: text().notNull(),
    status: text({ enum: approvalStatuses }).notNull().default("pending"),
    expiresAt: instant().notNull(),
    decidedAt: instant(),
    usedAt: instant(),
    ...timestamps,
  },
  (t) => [
    index().on(t.accountId),
    index().on(t.grantId),
    index().on(t.expiresAt),
    check("approvals_operation_check", oneOf(t.operation, approvalOperations)),
    check("approvals_status_check", oneOf(t.status, approvalStatuses)),
  ],
);

/**
 * An agent's write by its `idempotencyKey` (TS-22, TS-63): the batch whose mutation IDs the tool derives, so sending
 * the same key again replays what ran. Keys are the connection's own; `request_hash` refuses one reused for a
 * different change. Kept as long as mutations are (30 days).
 */
export const mcpOperations = table(
  "mcp_operations",
  {
    grantId: uuid()
      .notNull()
      .references(() => oauthConsents.id, { onDelete: "cascade" }),
    key: text().notNull(),
    batchId: uuid().notNull(),
    // The tool and its arguments, hashed (SHA-256, hex).
    requestHash: text().notNull(),
    items: integer().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.grantId, t.key] }), index().on(t.createdAt)],
);
