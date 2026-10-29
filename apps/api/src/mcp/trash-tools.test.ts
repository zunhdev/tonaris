// Recovery from Trash through MCP (FR-10.7, TS-63, TON-84) as contract tests for AC-36's recovery scenarios: units
// come back by the app's rules, asking for a destination or a name when needed, reporting skipped albums and sharing
// effects, and an expired or purged unit is unavailable. Moves report their sharing effects too (FR-07.14).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { trashUnits } from "@tonaris/db";
import { uuidv7 } from "@tonaris/domain";

import { createTestApp } from "../testing";
import { mcpHarness } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

const { registerClient, connect, mcpClient, insertAlbum } = mcpHarness(() => t);

async function manager() {
  const clientId = await registerClient();
  const connection = await connect("anna@example.com", clientId, "manage");
  return { ...connection, mcp: await mcpClient(connection.tokens.access_token) };
}

type Mcp = Awaited<ReturnType<typeof manager>>["mcp"];

/** Runs an app mutation as `cookie`, which must be confirmed. */
async function send(cookie: string, name: string, args: unknown) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), name, args },
    headers: { cookie },
  });
  expect(await response.json()).toMatchObject({ outcome: { status: "confirmed" } });
}

const answerSchema = z.object({
  items: z.array(
    z.looseObject({
      unitId: z.string().optional(),
      outcome: z.looseObject({ status: z.string() }),
    }),
  ),
});

async function recover(mcp: Mcp, items: Record<string, unknown>[]) {
  const answer = await mcp.callTool({ name: "recover_from_trash", arguments: { items } });
  return answerSchema.parse(answer.structuredContent).items;
}

async function container(
  cookie: string,
  kind: "folder" | "list",
  name: string,
  parentId: string | null = null,
) {
  const id = uuidv7();
  await send(cookie, "container.create", { id, kind, parentId, name });
  return id;
}

async function trash(cookie: string, id: string) {
  const unitId = uuidv7();
  await send(cookie, "container.delete", { id, unitId });
  return unitId;
}

const childrenOf = async (mcp: Mcp, containerId?: string) =>
  z
    .object({ children: z.array(z.object({ id: z.string(), name: z.string() })) })
    .parse(
      (
        await mcp.callTool({
          name: "list_container",
          arguments: containerId ? { containerId } : {},
        })
      ).structuredContent,
    )
    .children.map((child) => child.name);

describe("recover_from_trash (FR-10.7)", () => {
  test("a list comes back where it was, with its albums, and an album back to its lists", async () => {
    const { userId, cookie, mcp } = await manager();
    const list = await container(cookie, "list", "Doom");
    const album = await insertAlbum(userId, "Nightfall", "Candlemass", 1987);
    await send(cookie, "membership.add", { listId: list, albumId: album });
    const listUnit = await trash(cookie, list);
    const albumUnit = uuidv7();
    await send(cookie, "album.delete", { id: album, unitId: albumUnit });

    // The album comes back first; its list is still in Trash, so that entry is reported, kept for the list.
    expect(await recover(mcp, [{ unitId: albumUnit }])).toMatchObject([
      {
        unitId: albumUnit,
        outcome: {
          status: "confirmed",
          result: { skipped: [{ listId: list, listName: "Doom", reason: "list_in_trash" }] },
        },
      },
    ]);
    const [listBack] = await recover(mcp, [{ unitId: listUnit }]);
    expect(listBack?.outcome).toMatchObject({ status: "confirmed" });
    expect(await childrenOf(mcp)).toEqual(["Doom"]);
    expect(
      await mcp.callTool({ name: "list_container", arguments: { containerId: list } }),
    ).toMatchObject({ structuredContent: { albums: [{ title: "Nightfall" }] } });
  });

  test("asks for a destination when the folder is in Trash too, and for a name when it is taken", async () => {
    const { cookie, mcp } = await manager();
    const folder = await container(cookie, "folder", "Metal");
    const inner = await container(cookie, "list", "Doom", folder);
    const innerUnit = await trash(cookie, inner);
    await trash(cookie, folder);
    const taken = await container(cookie, "list", "Jazz");
    const takenUnit = await trash(cookie, taken);
    await container(cookie, "list", "Jazz");

    // Independent units: each answers on its own.
    const [destination, name] = await recover(mcp, [{ unitId: innerUnit }, { unitId: takenUnit }]);
    expect(destination?.outcome).toMatchObject({
      status: "needs_input",
      need: "destination",
      candidates: [{ unitId: innerUnit, name: "Doom", reason: "trashed" }],
    });
    expect(name?.outcome).toMatchObject({
      status: "needs_input",
      need: "name",
      candidates: [{ unitId: takenUnit, name: "Jazz" }],
    });

    const answered = await recover(mcp, [
      { unitId: innerUnit, parentId: null },
      { unitId: takenUnit, name: "Jazz (old)" },
    ]);
    expect(answered.map((item) => item.outcome.status)).toEqual(["confirmed", "confirmed"]);
    expect((await childrenOf(mcp)).toSorted()).toEqual(["Doom", "Jazz", "Jazz (old)"]);
  });

  test("reports albums a recovered list held that are in Trash themselves", async () => {
    const { userId, cookie, mcp } = await manager();
    const list = await container(cookie, "list", "Doom");
    const album = await insertAlbum(userId, "Nightfall", "Candlemass", 1987);
    await send(cookie, "membership.add", { listId: list, albumId: album });
    const listUnit = await trash(cookie, list);
    await send(cookie, "album.delete", { id: album, unitId: uuidv7() });

    const [item] = await recover(mcp, [{ unitId: listUnit }]);
    expect(item?.outcome).toMatchObject({
      status: "confirmed",
      result: {
        skipped: [{ albumId: album, title: "Nightfall", reason: "album_in_trash" }],
      },
    });
  });

  test("says who sees it again, recovered into a shared folder", async () => {
    const { cookie, mcp } = await manager();
    await t.signIn("ben@example.com");
    await send(cookie, "account.setDisplayName", { displayName: "Anna" });
    const shared = await container(cookie, "folder", "Shared");
    await send(cookie, "share.invite", {
      grantId: uuidv7(),
      containerId: shared,
      email: "ben@example.com",
    });
    const list = await container(cookie, "list", "Doom");
    const unitId = await trash(cookie, list);

    const [item] = await recover(mcp, [{ unitId, parentId: shared }]);
    expect(item).toMatchObject({
      unitId,
      sharing: { newlySeenBy: [{ kind: "person", invited: true, via: "Shared" }] },
      outcome: { status: "confirmed" },
    });
  });

  test("an expired unit is unavailable, and one no longer in Trash isn't found", async () => {
    const { cookie, mcp } = await manager();
    const unitId = await trash(cookie, await container(cookie, "list", "Old"));
    await t.db.update(trashUnits).set({ expiresAt: new Date(Date.now() - 1000) });

    const [expired, gone] = await recover(mcp, [{ unitId }, { unitId: uuidv7() }]);
    expect(expired?.outcome).toMatchObject({ status: "failed", code: "expired" });
    expect(gone?.outcome).toMatchObject({ status: "failed", code: "not_found" });
    expect(await childrenOf(mcp)).toEqual([]);
  });

  test("a Read-only connection can inspect Trash but not recover", async () => {
    const clientId = await registerClient();
    const { cookie, tokens } = await connect("anna@example.com", clientId, "read_only");
    const mcp = await mcpClient(tokens.access_token);
    await trash(cookie, await container(cookie, "list", "Doom"));
    expect(await mcp.callTool({ name: "list_trash", arguments: {} })).toMatchObject({
      structuredContent: { total: 1 },
    });
    const refused: unknown = await mcp
      .callTool({ name: "recover_from_trash", arguments: { items: [{ unitId: uuidv7() }] } })
      .catch((error: unknown) => error);
    expect(String(refused)).toContain("Tool recover_from_trash not found");
  });
});

describe("move_items' sharing effects (FR-07.14)", () => {
  test("a list moved into a shared folder names who newly sees it", async () => {
    const { cookie, mcp } = await manager();
    await t.signIn("ben@example.com");
    await send(cookie, "account.setDisplayName", { displayName: "Anna" });
    const shared = await container(cookie, "folder", "Shared");
    await send(cookie, "share.setLink", { containerId: shared, enabled: true, linkId: uuidv7() });
    const list = await container(cookie, "list", "Doom");

    const moved = await mcp.callTool({
      name: "move_items",
      arguments: { containerIds: [list], parentId: shared },
    });
    expect(moved.structuredContent).toMatchObject({
      items: [
        {
          containerId: list,
          sharing: { newlySeenBy: [{ kind: "link", via: "Shared" }] },
          outcome: { status: "confirmed" },
        },
      ],
    });
  });
});
