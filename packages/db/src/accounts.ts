// Account lookups outside Better Auth: the creator bootstrap (TS-71), which sessions are still live for the change
// streams (TS-23), and agreement to the terms (TON-131). Emails are email keys (TS-70).

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

/** Records that the account agreed to the terms' `version` (TON-131), whichever it agreed to before. */
export async function agreeToTerms(
  db: Database,
  where: { userId: string } | { emailKey: string },
  version: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(users)
    .set({ termsVersion: version, termsAgreedAt: now })
    .where("userId" in where ? eq(users.id, where.userId) : eq(users.email, where.emailKey));
}

/** Whether the account agreed to the terms' `version`, the current one. */
export async function agreedToTerms(
  db: Database,
  userId: string,
  version: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.termsVersion, version)));
  return row !== undefined;
}
