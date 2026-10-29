// Better Auth's tables (TS-11, TS-70): people, their web sessions, linked sign-in methods and pending codes.
// Better Auth reads and writes them through its Drizzle adapter; ids are UUIDv7 like every other entity (TS-10).

import { sql } from "drizzle-orm";
import { boolean, check, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { userRoles } from "@tonaris/domain";

import { instant, oneOf, table, timestamps } from "./columns";

/** One row per account. `email` holds the email key (TS-70), so lookups match however it was typed. */
export const users = table(
  "user",
  {
    id: uuid().primaryKey(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    // Better Auth's `name`. Null until the person sets one; never derived from the email (FR-11.3).
    displayName: text(),
    image: text(),
    role: text({ enum: userRoles }).notNull().default("user"),
    // Set when deletion starts (TS-74): the email has moved to a placeholder, and a job is removing the data.
    deletingAt: instant(),
    ...timestamps,
  },
  (t) => [
    check("user_role_check", oneOf(t.role, userRoles)),
    // The creator bootstrap is the only way to the role (TS-71), and there is one creator.
    uniqueIndex("user_single_creator_key")
      .on(t.role)
      .where(sql`${t.role} = 'creator'`),
  ],
);

/** Web sessions behind the `__Secure-tonaris.session_token` cookie (TS-70). */
export const sessions = table(
  "session",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: instant().notNull(),
    // Better Auth's columns; IP tracking is off, so `ip_address` stays empty (TS-70).
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/**
 * Better Auth's linked sign-in methods. Email codes never write here, but Better Auth refuses to start
 * without the table; OAuth for MCP and native apps may use it later (TS-61).
 */
export const authAccounts = table(
  "account",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: instant(),
    refreshTokenExpiresAt: instant(),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/** Pending sign-in codes, stored hashed with their attempt count (TS-70). */
export const verifications = table(
  "verification",
  {
    id: uuid().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: instant().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);
