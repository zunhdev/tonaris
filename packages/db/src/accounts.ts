// Account lookups outside Better Auth: the creator bootstrap (TS-71). Emails are email keys (TS-70).

import { eq } from "drizzle-orm";

import type { Database } from "./client";
import { users } from "./schema";

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
