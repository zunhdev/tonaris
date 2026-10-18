// Write serialization, the change stream and idempotency records (TS-11, TS-20–TS-23).
// Account columns reference `user` with NO ACTION, like owner columns (TS-74).

import { bigint, index, jsonb, text, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { instant, table, timestamps } from "./columns";

/**
 * One row per account. `UPDATE account_sync SET seq = seq + 1 … RETURNING seq` is the owner's write lock,
 * so commit order equals `seq` order, and `seq` is the stream cursor (TS-20, TS-23).
 */
export const accountSync = table("account_sync", {
  accountId: uuid()
    .primaryKey()
    .references(() => users.id),
  seq: bigint({ mode: "number" }).notNull().default(0),
  ...timestamps,
});

/** The account's change stream, replayed after a `Last-Event-ID` cursor. Retention 30 days (TS-23, TS-91). */
export const changeLog = table(
  "change_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    accountId: uuid()
      .notNull()
      .references(() => users.id),
    seq: bigint({ mode: "number" }).notNull(),
    entity: text().notNull(),
    // Text, not uuid: preference changes are keyed by view keys such as `root` (TS-11 `view_prefs`).
    entityId: text().notNull(),
    op: text().notNull(),
    data: jsonb(),
    mutationId: uuid(),
    ...timestamps,
  },
  (t) => [unique().on(t.accountId, t.seq), index().on(t.createdAt)],
);

/** Idempotency records keyed by the client's `mutationId`. Retention 30 days (TS-22). */
export const mutations = table(
  "mutations",
  {
    id: uuid().primaryKey(),
    accountId: uuid()
      .notNull()
      .references(() => users.id),
    // A web or native session, or an MCP grant (TS-30).
    principal: text().notNull(),
    name: text().notNull(),
    status: text().notNull(),
    result: jsonb(),
    receivedAt: instant().notNull().defaultNow(),
    completedAt: instant(),
    ...timestamps,
  },
  (t) => [index().on(t.accountId), index().on(t.receivedAt)],
);
