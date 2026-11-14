// Copying a share (FR-07.22, AC-51; TON-133) against the in-memory store: what the plan counts, albums reused by
// release group or link and new ones copied, fields mapped by name and type or created, a field of another type
// skipped, the copy sent again, a taken name, a limit, and folders that aren't a share to copy.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import type { StoredField } from "./fields";
import { uuidv7 } from "./ids";
import { maxFields } from "./limits";
import type { Principal } from "./principals";
import { copySummary, planShareCopy } from "./share-copy";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const denis = uuidv7();
const anna = uuidv7();
const asDenis: Principal = { kind: "user", userId: denis, role: "user", client: "web" };
const asAnna: Principal = { kind: "user", userId: anna, role: "user", client: "web" };

const container = (
  ownerId: string,
  kind: "folder" | "list",
  name: string,
  parentId: string | null = null,
): StoredContainer => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
  color: null,
  ownerId,
  trashed: false,
});
const album = (ownerId: string, title: string, releaseGroupId: string | null = null) => ({
  id: uuidv7(),
  title,
  artistCredit: "Sleep",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1999,
  recordingYearStart: null,
  recordingYearEnd: null,
  ownerId,
  releaseGroupId,
});

const metal = container(denis, "folder", "Metal");
const doom = container(denis, "list", "Doom", metal.id);
const mine = container(anna, "folder", "Mine");
const group = uuidv7();
const dopesmoker = album(denis, "Dopesmoker", group);
const holy = album(denis, "Holy Mountain");
const bleach = album(denis, "Bleach");
const annasDopesmoker = album(anna, "Dopesmoker", group);
const [calm, loud] = [uuidv7(), uuidv7()];
const mood: StoredField = {
  id: uuidv7(),
  name: "Mood",
  type: "single_choice",
  ownerId: denis,
  options: [
    { id: calm, label: "Calm" },
    { id: loud, label: "Loud" },
  ],
};
const bought: StoredField = {
  id: uuidv7(),
  name: "Bought",
  type: "date",
  ownerId: denis,
  options: [],
};
const format: StoredField = {
  id: uuidv7(),
  name: "Format",
  type: "yes_no",
  ownerId: denis,
  options: [],
};
const annasCalm = uuidv7();
const annasMood: StoredField = {
  id: uuidv7(),
  name: "mood",
  type: "single_choice",
  ownerId: anna,
  options: [{ id: annasCalm, label: "calm" }],
};
const annasFormat: StoredField = {
  id: uuidv7(),
  name: "Format",
  type: "text",
  ownerId: anna,
  options: [],
};

function setup({ annasFields = [annasMood, annasFormat] }: { annasFields?: StoredField[] } = {}) {
  const memory = memoryStore({
    containers: [metal, doom, mine],
    albums: [dopesmoker, holy, bleach, annasDopesmoker],
    links: [
      {
        albumId: dopesmoker.id,
        service: "spotify",
        url: "https://open.spotify.com/album/a",
        entityId: "a",
      },
      { albumId: holy.id, service: "tidal", url: "https://tidal.com/album/1", entityId: "1" },
    ],
    memberships: [dopesmoker, holy, bleach].map((each) => ({
      listId: doom.id,
      albumId: each.id,
      addedAt: "2026-11-01T00:00:00.000Z",
      ownerId: denis,
    })),
    fields: [mood, bought, format, ...annasFields],
    fieldValues: [
      { albumId: dopesmoker.id, fieldId: mood.id, value: calm },
      { albumId: holy.id, fieldId: mood.id, value: loud },
      { albumId: bleach.id, fieldId: bought.id, value: "2001-05-04" },
      { albumId: bleach.id, fieldId: format.id, value: true },
    ],
    accounts: [
      { id: denis, email: "denis@example.com", displayName: "Denis" },
      { id: anna, email: "anna@example.com" },
    ],
  });
  const run = (
    mutation: Omit<Mutation, "mutationId">,
    principal = asAnna,
  ): Promise<CommandResult> =>
    runCommand(mutationSchema.parse({ mutationId: uuidv7(), ...mutation }), {
      principal,
      store: memory.store,
    });
  const share = async () => {
    const grantId = uuidv7();
    await run(
      { name: "share.invite", args: { grantId, containerId: metal.id, email: "anna@example.com" } },
      asDenis,
    );
    await run({ name: "share.accept", args: { grantId } });
  };
  const copy = (copyId = uuidv7(), parentId: string | null = mine.id, name = "Metal") =>
    run({ name: "share.copy", args: { containerId: metal.id, copyId, parentId, name } });
  return { ...memory, run, share, copy };
}

describe("copying a share (FR-07.22)", () => {
  test("the plan counts what it adds, what is theirs already, and the fields it creates or skips", async () => {
    const { store, share } = setup();
    await share();
    const plan = await planShareCopy(store, {
      ownerId: anna,
      containerId: metal.id,
      parentId: mine.id,
      copyId: uuidv7(),
    });
    if ("status" in plan) throw new Error(plan.problem.detail);
    expect(plan.preview).toEqual({
      folders: 1,
      lists: 1,
      albums: 2,
      reused: 1,
      fields: 1,
      skippedFields: ["Format"],
      problems: [],
    });
    expect(copySummary(plan.preview)).toBe(
      "1 folder, 1 list and 3 albums, 1 of them already yours",
    );
  });

  test("the copy is theirs: folders and lists, albums new or reused, links, and values on their fields", async () => {
    const { store, share, copy } = setup();
    await share();
    const copyId = uuidv7();
    const done = await copy(copyId);
    expect(done).toMatchObject({
      status: "applied",
      result: { containerId: copyId, albums: 2, reused: 1 },
    });

    const top = await store.findContainer(copyId);
    expect(top).toMatchObject({ name: "Metal", kind: "folder", parentId: mine.id, ownerId: anna });
    const [, list] = await store.activeSubtree(copyId);
    expect(list).toMatchObject({ name: "Doom", kind: "list" });
    const entries = await store.listEntries([list?.id ?? ""]);
    expect(entries).toHaveLength(3);
    // Their own Dopesmoker joins the list, keeping its own details; the others are new albums of theirs.
    expect(entries.map((entry) => entry.albumId)).toContain(annasDopesmoker.id);
    const added = await Promise.all(
      entries
        .filter((entry) => entry.albumId !== annasDopesmoker.id)
        .map((entry) => store.findAlbum(entry.albumId)),
    );
    expect(added.map((each) => [each?.title, each?.ownerId])).toEqual(
      expect.arrayContaining([
        ["Holy Mountain", anna],
        ["Bleach", anna],
      ]),
    );
    const newHoly = added.find((each) => each?.title === "Holy Mountain");
    if (!newHoly) throw new Error("Holy Mountain wasn't copied.");
    expect(await store.findServiceLink(newHoly.id, "tidal")).toMatchObject({ entityId: "1" });

    // "Loud" joins their "mood"; "Bought" is created; their "Format" is another type and gets nothing.
    const theirs = await store.fieldsOf(anna);
    const theirMood = theirs.find((field) => field.id === annasMood.id);
    expect(theirMood?.options.map((option) => option.label)).toEqual(["calm", "Loud"]);
    const loudOfTheirs = theirMood?.options.find((option) => option.label === "Loud")?.id;
    expect(await store.findFieldValue(newHoly.id, annasMood.id)).toBe(loudOfTheirs);
    expect(theirs.map((field) => field.name).toSorted()).toEqual(["Bought", "Format", "mood"]);
    // Their own album keeps its details: nothing is set on it.
    expect(await store.findFieldValue(annasDopesmoker.id, annasMood.id)).toBeUndefined();
    // The owner's share is as it was.
    expect(await store.findContainer(metal.id)).toMatchObject({ ownerId: denis, parentId: null });
    expect(await store.listEntries([doom.id])).toHaveLength(3);
  });

  test("sent again, it copies nothing more; a name taken there is refused", async () => {
    const { store, share, copy } = setup();
    await share();
    const copyId = uuidv7();
    await copy(copyId);
    expect(await copy(copyId)).toEqual({ status: "applied", changes: [] });
    expect(await copy()).toMatchObject({
      status: "failed",
      code: "name_conflict",
      problem: { detail: "'Metal' already exists in Mine. Choose another name." },
    });
    expect(await copy(uuidv7(), mine.id, "Metal 2")).toMatchObject({ status: "applied" });
    expect((await store.activeChildren(anna, mine.id)).map((each) => each.name).toSorted()).toEqual(
      ["Metal", "Metal 2"],
    );
  });

  test("over a limit, nothing is copied, and the refusal says which and by how much", async () => {
    const full = Array.from({ length: maxFields }, (_, index): StoredField => ({
      id: uuidv7(),
      name: `Field ${index}`,
      type: "text",
      ownerId: anna,
      options: [],
    }));
    const { store, share, copy } = setup({ annasFields: full });
    await share();
    const refused = await copy();
    expect(refused).toMatchObject({ status: "failed", code: "limit_exceeded" });
    if (refused.status !== "failed") throw new Error("Copied");
    expect(refused.problem.detail).toContain("Nothing was copied.");
    expect(refused.problem.detail).toContain("custom fields");
    expect(await store.activeChildren(anna, mine.id)).toEqual([]);
  });

  test("a folder that isn't shared with them, or their own, isn't a share to copy", async () => {
    const { run, copy } = setup();
    expect(await copy()).toMatchObject({ status: "failed", code: "not_found" });
    expect(
      await run({
        name: "share.copy",
        args: { containerId: mine.id, copyId: uuidv7(), parentId: null, name: "Mine" },
      }),
    ).toMatchObject({ status: "failed", code: "not_found" });
  });
});
