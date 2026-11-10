// Editors change a share through the owner's commands (FR-07.18–FR-07.21; TS-30): inside the share, in the owner's
// collection, never on the shared folder or list itself, never across the share's edge, never with fields, sharing or
// the owner's Trash beyond their own Undo; viewers and strangers learn nothing they couldn't read.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import type { ShareRole } from "./sharing";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const denis = uuidv7();
const anna = uuidv7();
const ben = uuidv7();
const cleo = uuidv7();
const as = (userId: string): Principal => ({ kind: "user", userId, role: "user", client: "web" });
const annasAgent: Principal = { kind: "mcp", userId: anna, grantId: uuidv7(), mode: "manage" };
const annasReader: Principal = { kind: "mcp", userId: anna, grantId: uuidv7(), mode: "read_only" };

const container = (
  name: string,
  kind: "folder" | "list",
  parentId: string | null = null,
): StoredContainer => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
  color: null,
  ownerId: denis,
  trashed: false,
});

/** Denis's collection: "Metal" shared with Anna to edit and Ben to view, "Jazz" with Anna to edit, "Private" not. */
function setup() {
  const metal = container("Metal", "folder");
  const doom = container("Doom", "list", metal.id);
  const funeral = container("Funeral", "folder", metal.id);
  const deep = container("Deep", "list", funeral.id);
  const priv = container("Private", "folder");
  const secret = container("Secret", "list", priv.id);
  const jazz = container("Jazz", "folder");
  const album = (title: string) => ({
    id: uuidv7(),
    title,
    artistCredit: "Someone",
    releaseType: "album" as const,
    isLive: false,
    originalYear: 1990,
    recordingYearStart: null,
    recordingYearEnd: null,
    ownerId: denis,
  });
  const nightfall = album("Nightfall");
  const bleach = album("Bleach");
  const hidden = album("Hidden");
  const entry = (listId: string, albumId: string) => ({
    listId,
    albumId,
    addedAt: "2026-11-10T10:00:00.000Z",
    ownerId: denis,
  });
  const rating = {
    id: uuidv7(),
    name: "Rating",
    type: "number" as const,
    options: [],
    ownerId: denis,
  };
  const memory = memoryStore({
    containers: [metal, doom, funeral, deep, priv, secret, jazz],
    albums: [nightfall, bleach, hidden],
    memberships: [
      entry(doom.id, nightfall.id),
      entry(doom.id, bleach.id),
      entry(secret.id, bleach.id),
      entry(secret.id, hidden.id),
    ],
    fields: [rating],
    accounts: [
      { id: denis, email: "denis@example.com", displayName: "Denis" },
      { id: anna, email: "anna@example.com" },
      { id: ben, email: "ben@example.com" },
      { id: cleo, email: "cleo@example.com" },
    ],
  });
  const grant = (containerId: string, granteeId: string, role: ShareRole) => {
    const id = uuidv7();
    memory.grants.set(id, {
      id,
      containerId,
      granteeId,
      invitedEmail: "someone@example.com",
      status: "accepted",
      role,
      emailStatus: "sent",
    });
    return id;
  };
  const annaOnMetal = grant(metal.id, anna, "edit");
  grant(metal.id, ben, "view");
  grant(jazz.id, anna, "edit");
  let clock = Date.parse("2026-11-10T12:00:00Z");
  const run = (mutation: Mutation, principal: Principal = as(anna)): Promise<CommandResult> => {
    clock += 60_000;
    return runCommand(mutationSchema.parse(mutation), {
      principal,
      store: memory.store,
      now: new Date(clock),
    });
  };
  return {
    ...memory,
    run,
    annaOnMetal,
    tree: { metal, doom, funeral, deep, priv, secret, jazz },
    records: { nightfall, bleach, hidden },
    rating,
  };
}

const code = (result: CommandResult) => (result.status === "failed" ? result.code : result.status);
const m = (name: Mutation["name"], args: unknown, base?: unknown): Mutation =>
  mutationSchema.parse({
    mutationId: uuidv7(),
    name,
    args,
    ...(base === undefined ? {} : { base }),
  });

describe("folders and lists inside a share (FR-07.19)", () => {
  test("an editor creates, renames, describes and colors them, in the owner's collection, the share's own too", async () => {
    const { run, containers, tree } = setup();
    const id = uuidv7();
    expect(
      code(
        await run(
          m("container.create", { id, kind: "list", parentId: tree.metal.id, name: "Sludge" }),
        ),
      ),
    ).toBe("applied");
    expect(containers.get(id)?.ownerId).toBe(denis);
    expect(
      code(
        await run(
          m("container.rename", { id: tree.doom.id, name: "Doom Metal" }, { name: "Doom" }),
        ),
      ),
    ).toBe("applied");
    expect(
      code(
        await run(m("container.rename", { id: tree.metal.id, name: "Heavy" }, { name: "Metal" })),
      ),
    ).toBe("applied");
    expect(
      code(
        await run(
          m(
            "container.describe",
            { id: tree.metal.id, description: "Loud" },
            { description: null },
          ),
        ),
      ),
    ).toBe("applied");
    expect(
      code(
        await run(m("container.setColor", { id: tree.metal.id, color: "red" }, { color: null })),
      ),
    ).toBe("applied");
    expect(containers.get(tree.metal.id)).toMatchObject({
      name: "Heavy",
      description: "Loud",
      color: "red",
      ownerId: denis,
    });
  });

  test("nothing is made outside the share: a private folder isn't there, and the top level is the editor's own", async () => {
    const { run, containers, tree } = setup();
    expect(
      code(
        await run(
          m("container.create", { id: uuidv7(), kind: "list", parentId: tree.priv.id, name: "X" }),
        ),
      ),
    ).toBe("invalid_destination");
    const own = uuidv7();
    expect(
      code(
        await run(m("container.create", { id: own, kind: "list", parentId: null, name: "Mine" })),
      ),
    ).toBe("applied");
    expect(containers.get(own)?.ownerId).toBe(anna);
  });

  test("moves stay inside one share; the shared folder itself doesn't move", async () => {
    const { run, containers, tree } = setup();
    const move = (id: string, from: string | null, to: string | null) =>
      run(m("container.move", { id, parentId: to }, { parentId: from }));
    expect(code(await move(tree.doom.id, tree.metal.id, tree.funeral.id))).toBe("applied");
    expect(containers.get(tree.doom.id)?.parentId).toBe(tree.funeral.id);
    expect(code(await move(tree.doom.id, tree.funeral.id, tree.priv.id))).toBe(
      "invalid_destination",
    );
    expect(code(await move(tree.doom.id, tree.funeral.id, null))).toBe("invalid_destination");
    expect(code(await move(tree.doom.id, tree.funeral.id, tree.jazz.id))).toBe(
      "invalid_destination",
    );
    expect(code(await move(tree.metal.id, null, tree.jazz.id))).toBe("permission_denied");
    expect(containers.get(tree.doom.id)?.parentId).toBe(tree.funeral.id);
    expect(containers.get(tree.metal.id)?.parentId).toBeNull();
  });

  test("an editor deletes inside the share, to the owner's Trash, and undoes it; never the shared folder itself", async () => {
    const { run, containers, trashUnits, tree } = setup();
    expect(code(await run(m("container.delete", { id: tree.metal.id, unitId: uuidv7() })))).toBe(
      "permission_denied",
    );
    const unitId = uuidv7();
    expect(code(await run(m("container.delete", { id: tree.doom.id, unitId })))).toBe("applied");
    expect(trashUnits.get(unitId)).toMatchObject({ ownerId: denis, deletedBy: anna });
    expect(containers.get(tree.doom.id)?.trashed).toBe(true);
    // Not through an agent, and not elsewhere: only back where it was.
    expect(code(await run(m("trash.recover", { unitId }), annasAgent))).toBe("not_found");
    expect(code(await run(m("trash.recover", { unitId, parentId: tree.funeral.id })))).toBe(
      "permission_denied",
    );
    expect(code(await run(m("trash.recover", { unitId })))).toBe("applied");
    expect(containers.get(tree.doom.id)?.trashed).toBe(false);
  });

  test("the owner's own deletions stay the owner's to recover; Trash is never emptied by an editor", async () => {
    const { run, containers, trashUnits, tree } = setup();
    const unitId = uuidv7();
    expect(code(await run(m("container.delete", { id: tree.deep.id, unitId }), as(denis)))).toBe(
      "applied",
    );
    expect(code(await run(m("trash.recover", { unitId })))).toBe("not_found");
    expect(code(await run(m("trash.purge", { unitIds: [unitId] }), as(anna)))).toBe("applied");
    expect(trashUnits.has(unitId)).toBe(true);
    expect(containers.get(tree.deep.id)?.trashed).toBe(true);
  });
});

describe("albums inside a share (FR-07.19, FR-07.21)", () => {
  test("an editor changes an album in the share, wherever it shows; not one only in private lists", async () => {
    const {
      run,
      albums: rows,
      records: { nightfall, bleach, hidden },
      rating,
    } = setup();
    expect(
      code(
        await run(
          m("album.update", { id: bleach.id, title: "Bleach (Deluxe)" }, { title: "Bleach" }),
        ),
      ),
    ).toBe("applied");
    expect(rows.get(bleach.id)?.title).toBe("Bleach (Deluxe)");
    expect(
      code(await run(m("album.update", { id: hidden.id, title: "Found" }, { title: "Hidden" }))),
    ).toBe("not_found");
    expect(
      code(await run(m("fieldValue.apply", { albumId: nightfall.id, fieldId: rating.id }))),
    ).toBe("applied");
    expect(
      code(
        await run(
          m(
            "fieldValue.set",
            { albumId: nightfall.id, fieldId: rating.id, value: "5" },
            { value: null },
          ),
        ),
      ),
    ).toBe("applied");
    // Fields themselves stay the owner's (FR-07.20).
    expect(
      code(await run(m("field.rename", { id: rating.id, name: "Score" }, { name: "Rating" }))),
    ).toBe("permission_denied");
  });

  test("an editor adds albums they see, and new ones, to the share's lists; never one they don't see", async () => {
    const {
      run,
      memberships,
      albums: rows,
      tree,
      records: { bleach, hidden },
    } = setup();
    expect(code(await run(m("membership.add", { listId: tree.deep.id, albumId: bleach.id })))).toBe(
      "applied",
    );
    expect(code(await run(m("membership.add", { listId: tree.doom.id, albumId: hidden.id })))).toBe(
      "not_found",
    );
    expect(memberships.has(`${tree.doom.id}:${hidden.id}`)).toBe(false);
    const id = uuidv7();
    const created = m("album.create", {
      id,
      title: "Epicus",
      artistCredit: "Candlemass",
      releaseType: "album",
      isLive: false,
      originalYear: 1986,
      recordingYearStart: null,
      recordingYearEnd: null,
      listId: tree.doom.id,
    });
    expect(code(await run(created))).toBe("applied");
    expect(rows.get(id)?.ownerId).toBe(denis);
    expect(memberships.has(`${tree.doom.id}:${id}`)).toBe(true);
  });

  test("an editor's deletion takes an album out of the share; the owner's other lists keep it, else it goes to Trash", async () => {
    const {
      run,
      memberships,
      albums: rows,
      trashUnits,
      tree,
      records: { nightfall, bleach },
    } = setup();
    expect(code(await run(m("album.delete", { id: bleach.id, unitId: uuidv7() })))).toBe("applied");
    expect(memberships.has(`${tree.doom.id}:${bleach.id}`)).toBe(false);
    expect(memberships.has(`${tree.secret.id}:${bleach.id}`)).toBe(true);
    expect(rows.get(bleach.id)?.trashed).toBe(false);
    const unitId = uuidv7();
    expect(code(await run(m("album.delete", { id: nightfall.id, unitId })))).toBe("applied");
    expect(rows.get(nightfall.id)?.trashed).toBe(true);
    expect(trashUnits.get(unitId)).toMatchObject({ ownerId: denis, deletedBy: anna });
  });

  test("removing from a list leaves an album in the owner's Unsorted, never the editor's", async () => {
    const {
      run,
      albums: rows,
      tree,
      records: { nightfall },
    } = setup();
    expect(
      code(await run(m("membership.remove", { listId: tree.doom.id, albumId: nightfall.id }))),
    ).toBe("applied");
    expect(rows.get(nightfall.id)).toMatchObject({ ownerId: denis, trashed: false });
  });
});

describe("what an editor's answers don't tell (FR-07.20, FR-07.21; TON-193)", () => {
  test("a new folder, list or album with an ID already used outside the share is only refused as in use", async () => {
    const { run, tree, records } = setup();
    const taken = await run(
      m("container.create", {
        id: tree.secret.id,
        kind: "list",
        parentId: tree.metal.id,
        name: "x",
      }),
    );
    expect(taken).toMatchObject({ problem: { detail: "This ID is already in use." } });
    const album = await run(
      m("album.create", {
        id: records.hidden.id,
        listId: tree.doom.id,
        title: "x",
        artistCredit: "x",
        releaseType: "album",
        isLive: false,
        originalYear: 2000,
        recordingYearStart: null,
        recordingYearEnd: null,
      }),
    );
    expect(album).toMatchObject({ problem: { detail: "This album ID is already in use." } });
    // Inside the share, a different create with a used ID is still a conflict with what's there.
    expect(
      await run(
        m("container.create", {
          id: tree.deep.id,
          kind: "list",
          parentId: tree.metal.id,
          name: "x",
        }),
      ),
    ).toMatchObject({ status: "conflict" });
  });

  test("moving the shared folder is refused before its base is compared, so the folder above it never shows", async () => {
    const { run, tree } = setup();
    const outer = container("Outer", "folder");
    const stale = await run(
      m("container.move", { id: tree.metal.id, parentId: tree.jazz.id }, { parentId: outer.id }),
    );
    expect(stale).toMatchObject({ status: "failed", code: "permission_denied" });
  });

  test("renaming the shared folder to a name used beside it says only that it's taken", async () => {
    const { run, tree } = setup();
    const rename = (id: string, from: string, name: string) =>
      run(m("container.rename", { id, name }, { name: from }));
    const top = await rename(tree.metal.id, "Metal", "private");
    expect(top).toMatchObject({ status: "failed", code: "name_conflict" });
    if (top.status !== "failed") throw new Error("refused above");
    expect(top.problem.detail).toBe(
      "'private' is already used where this is kept. Choose another name.",
    );
    // Inside the share, the sibling is the editor's to see, so the usual answer names it.
    expect(await rename(tree.doom.id, "Doom", "funeral")).toMatchObject({
      problem: { detail: "'Funeral' already exists in Metal. Choose another name." },
    });
  });

  test("an editor's Undo doesn't list what of theirs the owner has in Trash", async () => {
    const { run, tree, records } = setup();
    // Denis deletes Bleach, which was also in Doom; then Anna deletes Doom and undoes it.
    expect(
      code(await run(m("album.delete", { id: records.bleach.id, unitId: uuidv7() }), as(denis))),
    ).toBe("applied");
    const unitId = uuidv7();
    expect(code(await run(m("container.delete", { id: tree.doom.id, unitId })))).toBe("applied");
    const undone = await run(m("trash.recover", { unitId }));
    expect(undone).toMatchObject({ status: "applied", result: { skipped: [] } });
  });
});

describe("who may edit (FR-07.18, FR-07.20)", () => {
  test("a viewer is told they can only view; a stranger learns nothing", async () => {
    const {
      run,
      tree,
      records: { nightfall },
    } = setup();
    const rename = m("container.rename", { id: tree.doom.id, name: "X" }, { name: "Doom" });
    expect(await run(rename, as(ben))).toMatchObject({
      code: "permission_denied",
      problem: { detail: "You can view this folder or list, but not change it." },
    });
    expect(code(await run(rename, as(cleo)))).toBe("not_found");
    expect(
      code(
        await run(
          m("album.update", { id: nightfall.id, title: "X" }, { title: "Nightfall" }),
          as(ben),
        ),
      ),
    ).toBe("permission_denied");
    expect(
      code(
        await run(
          m("album.update", { id: nightfall.id, title: "X" }, { title: "Nightfall" }),
          as(cleo),
        ),
      ),
    ).toBe("not_found");
  });

  test("an editor's Manage agent edits as they do; a Read-only one doesn't", async () => {
    const { run, tree } = setup();
    expect(
      code(
        await run(
          m("container.rename", { id: tree.doom.id, name: "Doom II" }, { name: "Doom" }),
          annasAgent,
        ),
      ),
    ).toBe("applied");
    expect(
      code(
        await run(
          m("container.rename", { id: tree.doom.id, name: "X" }, { name: "Doom II" }),
          annasReader,
        ),
      ),
    ).toBe("permission_denied");
  });

  test("a lowered role refuses the next change; sharing stays the owner's", async () => {
    const { run, grants, annaOnMetal, tree } = setup();
    const grant = grants.get(annaOnMetal);
    if (grant) grant.role = "view";
    expect(
      code(await run(m("container.rename", { id: tree.doom.id, name: "X" }, { name: "Doom" }))),
    ).toBe("permission_denied");
    if (grant) grant.role = "edit";
    expect(
      code(
        await run(
          m("share.invite", {
            grantId: uuidv7(),
            containerId: tree.metal.id,
            email: "cleo@example.com",
          }),
        ),
      ),
    ).toBe("permission_denied");
    expect(code(await run(m("share.setRole", { grantId: annaOnMetal, role: "edit" })))).toBe(
      "permission_denied",
    );
  });

  test("the owner and an editor changing the same field: the later one gets a conflict, not a lost change", async () => {
    const { run, containers, tree } = setup();
    expect(
      code(
        await run(
          m("container.rename", { id: tree.doom.id, name: "Doom (Denis)" }, { name: "Doom" }),
          as(denis),
        ),
      ),
    ).toBe("applied");
    expect(
      code(
        await run(
          m("container.rename", { id: tree.doom.id, name: "Doom (Anna)" }, { name: "Doom" }),
        ),
      ),
    ).toBe("conflict");
    expect(containers.get(tree.doom.id)?.name).toBe("Doom (Denis)");
  });
});
