// Account lookups outside Better Auth: the creator bootstrap (TS-71), and which sessions are still live for the
// change streams (TS-23). Emails are email keys (TS-70).

import { and, eq, gt, inArray } from "drizzle-orm";

import type { Database } from "./client";
import { sessions, users } from "./schema";

export type UserRow = typeof users.$inferSelect;

export async function findUserByEmail(
  db: Database,
  emailKey: string,
): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, emailKey));
  return user;
}

export async function findCreator(db: Database): Promise<UserRow | undefined> {
  const [creator] = await db.select().from(users).where(eq(users.role, "creator"));
  return creator;
}

/** Inserts the creator's account. The single-creator index refuses a second one, even under a race. */
export async function insertCreator(
  db: Database,
  values: { id: string; email: string },
): Promise<void> {
  await db.insert(users).values({ ...values, emailVerified: true, role: "creator" });
}

/** Which of `ids` are sessions that still exist and haven't expired at `now`: the rest were signed out or revoked. */
export async function activeSessionIds(
  db: Database,
  ids: readonly string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(inArray(sessions.id, [...ids]), gt(sessions.expiresAt, now)));
  return new Set(rows.map((row) => row.id));
}
