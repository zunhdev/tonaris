// The creator bootstrap (TS-71): `bun run seed:creator` creates the creator's account from CREATOR_EMAIL, the only
// way to the creator role. It is idempotent, so the host's pre-deploy step can run it on every deploy (TS-110).

import { z } from "zod";

import {
  createDatabase,
  databaseUrl,
  type Database,
  findCreator,
  findUserByEmail,
  insertCreator,
} from "@tonaris/db";
import { emailKey } from "@tonaris/domain";

/** A refusal with an explanation for whoever runs the command. */
export class SeedError extends Error {}

export type SeedResult = { status: "created" | "exists"; id: string; email: string };

export async function seedCreator(
  db: Database,
  creatorEmail: string | undefined,
): Promise<SeedResult> {
  if (!creatorEmail?.trim()) {
    throw new SeedError("Set CREATOR_EMAIL to the creator's email address.");
  }
  const email = emailKey(creatorEmail);
  if (!z.email().safeParse(email).success) {
    throw new SeedError(`CREATOR_EMAIL is not an email address: "${creatorEmail}".`);
  }

  const creator = await findCreator(db);
  if (creator) {
    if (creator.email === email) return { status: "exists", id: creator.id, email };
    throw new SeedError(
      `A creator already exists (${creator.email}). There is only one, and this command doesn't change it.`,
    );
  }
  if (await findUserByEmail(db, email)) {
    throw new SeedError(
      `${email} already belongs to an account, and the creator role can't be granted to an existing one.`,
    );
  }

  const id = Bun.randomUUIDv7();
  await insertCreator(db, { id, email });
  return { status: "created", id, email };
}

if (import.meta.main) {
  const db = createDatabase(databaseUrl(), { max: 1 });
  try {
    const { status, email } = await seedCreator(db, process.env.CREATOR_EMAIL);
    console.log(
      status === "created"
        ? `Created the creator, ${email}.`
        : `The creator, ${email}, already exists.`,
    );
  } catch (error) {
    if (!(error instanceof SeedError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
