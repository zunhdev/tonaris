// Custom field definitions against the local Postgres 18 (FR-03.6, FR-03.9, FR-03.11, X-09, TS-121): a field and its
// options saved in order and in the bootstrap, names unique per account across types, and a rename that reaches a
// value an album in Trash keeps.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import { createDatabase } from "./client";
import { testDatabaseUrl } from "./config";
import { albumFieldValues, albums, fieldDefinitions, trashUnits, users } from "./schema";
import { collectionStore } from "./store";
import { bootstrapSnapshot, executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function newPrincipal(): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  return { kind: "user", userId, role: "user", client: "web" };
}

const create = (
  name: string,
  type: Extract<Mutation, { name: "field.create" }>["args"]["type"],
  labels: string[] = [],
) => {
  const mutation: Extract<Mutation, { name: "field.create" }> = {
    mutationId: uuidv7(),
    name: "field.create",
    args: { id: uuidv7(), name, type, options: labels.map((label) => ({ id: uuidv7(), label })) },
  };
  return mutation;
};

describe("field definitions (FR-03.6, FR-03.9)", () => {
  test("a field and its options are saved in order, logged, and in the bootstrap", async () => {
    const anna = await newPrincipal();
    const mood = create("Mood", "multiple_choice", ["Loud", "Calm", "Odd"]);
    const { result, changes } = await executeMutation(t.db, anna, mood);
    expect(result.outcome.status).toBe("confirmed");
    const expected = {
      id: mood.args.id,
      name: "Mood",
      type: "multiple_choice" as const,
      options: mood.args.options,
    };
    expect(changes).toMatchObject([{ entity: "field", op: "insert", data: expected }]);
    expect((await bootstrapSnapshot(t.db, anna.userId)).fields).toEqual([expected]);
  });

  test("names collide case-insensitively across types within an account, not across accounts", async () => {
    const anna = await newPrincipal();
    const ben = await newPrincipal();
    await executeMutation(t.db, anna, create("Rating", "number"));
    const taken = await executeMutation(t.db, anna, create("RATING", "single_choice"));
    expect(taken.result.outcome).toMatchObject({ status: "failed", code: "name_conflict" });
    const theirs = await executeMutation(t.db, ben, create("Rating", "number"));
    expect(theirs.result.outcome.status).toBe("confirmed");
    expect((await bootstrapSnapshot(t.db, anna.userId)).fields).toHaveLength(1);
  });
});

describe("the store's fields (FR-03.6, FR-03.9)", () => {
  test("an owner's fields come as the bootstrap has them, in as many queries however many there are", async () => {
    const anna = await newPrincipal();
    let queries = 0;
    const counted = createDatabase(testDatabaseUrl(), {
      max: 1,
      connection: { search_path: t.schema },
      debug: () => {
        queries += 1;
      },
    });
    const read = async () => {
      queries = 0;
      const fields = await counted.transaction((tx) => collectionStore(tx).fieldsOf(anna.userId));
      return { fields, queries };
    };
    try {
      // The connection's first query sets it up.
      await read();
      await executeMutation(t.db, anna, create("Mood", "multiple_choice", ["Loud", "Calm"]));
      const one = await read();
      await executeMutation(t.db, anna, create("Era", "single_choice", ["Late", "Early"]));
      await executeMutation(t.db, anna, create("Rating", "number"));
      const three = await read();
      expect(three.queries).toBe(one.queries);
      expect(three.fields).toHaveLength(3);
      expect(three.fields).toEqual((await bootstrapSnapshot(t.db, anna.userId)).fields);
    } finally {
      await counted.$client.end();
    }
  });
});

describe("field.rename (FR-03.11, X-09)", () => {
  test("a rename reaches an album in Trash, whose value stays", async () => {
    const anna = await newPrincipal();
    const rating = create("Rating", "number");
    await executeMutation(t.db, anna, rating);
    const albumId = uuidv7();
    const unitId = uuidv7();
    const deletedAt = new Date();
    await t.db.insert(trashUnits).values({
      id: unitId,
      ownerId: anna.userId,
      kind: "album",
      rootId: albumId,
      deletedAt,
      expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
    });
    await t.db.insert(albums).values({
      id: albumId,
      ownerId: anna.userId,
      title: "Bleach",
      artistCredit: "Nirvana",
      originalYear: 1989,
      searchTitleKey: "bleach",
      searchArtistKey: "nirvana",
      trashedAt: deletedAt,
      trashUnitId: unitId,
    });
    await t.db
      .insert(albumFieldValues)
      .values({ albumId, fieldId: rating.args.id, numberValue: "4.5" });

    const renamed = await executeMutation(t.db, anna, {
      mutationId: uuidv7(),
      name: "field.rename",
      args: { id: rating.args.id, name: "Score" },
      base: { name: "Rating" },
    });
    expect(renamed.changes).toMatchObject([
      { entity: "field", op: "update", data: { name: "Score" } },
    ]);
    const [definition] = await t.db
      .select({ name: fieldDefinitions.name, nameKey: fieldDefinitions.nameKey })
      .from(fieldDefinitions);
    expect(definition).toEqual({ name: "Score", nameKey: "score" });
    const [value] = await t.db
      .select({ numberValue: albumFieldValues.numberValue })
      .from(albumFieldValues)
      .where(eq(albumFieldValues.albumId, albumId));
    expect(value?.numberValue).toBe("4.5");
  });
});
