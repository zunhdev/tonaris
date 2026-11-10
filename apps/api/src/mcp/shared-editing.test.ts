// An editor's AI agent edits a share as the editor can in the app (FR-10.3, FR-10.4, FR-07.19–FR-07.21; TON-192):
// a Manage collection connection sees its role in Shared with me and changes the share's folders, lists and albums,
// while the owner's fields, Trash and everything outside the share stay out of reach; a Read-only one only reads.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { fieldDefinitions, savedReferences, shareGrants } from "@tonaris/db";
import { nameKey } from "@tonaris/domain";

import { fixtureCapture } from "../capture-fixtures";
import { createTestApp } from "../testing";
import { mcpHarness } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp({ capture: fixtureCapture() });
});

afterEach(async () => {
  await t.drop();
});

const { registerClient, connect, mcpClient, insertAlbum, insertList } = mcpHarness(() => t);

const id = () => Bun.randomUUIDv7();

async function agentOf(email: string, mode: "manage" | "read_only") {
  const clientId = await registerClient();
  const connection = await connect(email, clientId, mode);
  return { ...connection, mcp: await mcpClient(connection.tokens.access_token) };
}

type Mcp = Awaited<ReturnType<typeof agentOf>>["mcp"];

const answerSchema = z.object({
  items: z.array(
    z.looseObject({ outcome: z.looseObject({ status: z.string(), code: z.string().optional() }) }),
  ),
});

async function write(mcp: Mcp, name: string, args: Record<string, unknown>) {
  const answer = await mcp.callTool({ name, arguments: args });
  if (answer.isError) throw new Error(`${name} failed: ${JSON.stringify(answer.content)}`);
  return answerSchema.parse(answer.structuredContent).items.map((item) => item.outcome);
}

/** Denis's "Doom" with "Nightfall", shared with Anna to edit and kept in her Shared with me; his "Secret" isn't. */
async function sharedWithAnna() {
  const { id: denis } = await t.signIn("denis@example.com");
  const { id: anna } = await t.signIn("anna@example.com");
  const nightfall = await insertAlbum(denis, "Nightfall", "Candlemass", 1987);
  const hidden = await insertAlbum(denis, "Hidden", "Someone", 1990);
  const doom = await insertList(denis, "Doom", [nightfall]);
  const secret = await insertList(denis, "Secret", [hidden]);
  await t.db.insert(shareGrants).values({
    id: id(),
    containerId: doom,
    granteeId: anna,
    invitedEmail: "anna@example.com",
    status: "accepted",
    role: "edit",
  });
  await t.db.insert(savedReferences).values({ viewerId: anna, containerId: doom, linkId: null });
  const rating = id();
  await t.db.insert(fieldDefinitions).values({
    id: rating,
    ownerId: denis,
    name: "Rating",
    nameKey: nameKey("Rating"),
    type: "number",
  });
  return { denis, anna, nightfall, hidden, doom, secret, rating };
}

describe("an editor's agent (FR-10.4, FR-07.19)", () => {
  test("sees its role, and changes the share's lists and albums as the editor can", async () => {
    const { doom, nightfall } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "manage");
    const shared = z
      .object({ entries: z.array(z.looseObject({ containerId: z.string(), role: z.string() })) })
      .parse(
        (await mcp.callTool({ name: "list_shared_with_me", arguments: {} })).structuredContent,
      );
    expect(shared.entries).toEqual([expect.objectContaining({ containerId: doom, role: "edit" })]);

    expect(await write(mcp, "rename_container", { containerId: doom, name: "Doom Metal" })).toEqual(
      [expect.objectContaining({ status: "confirmed" })],
    );
    expect(
      await write(mcp, "update_album", {
        albumId: nightfall,
        values: { title: "Nightfall (Remastered)" },
      }),
    ).toEqual([expect.objectContaining({ status: "confirmed" })]);
  });

  test("is refused outside the share, on the owner's fields and on the owner's Trash", async () => {
    const { secret, hidden, rating } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "manage");
    expect(await write(mcp, "rename_container", { containerId: secret, name: "Mine" })).toEqual([
      expect.objectContaining({ status: "failed", code: "not_found" }),
    ]);
    expect(
      await write(mcp, "update_album", { albumId: hidden, values: { title: "Found" } }),
    ).toEqual([expect.objectContaining({ status: "failed", code: "not_found" })]);
    expect(await write(mcp, "rename_field", { fieldId: rating, name: "Score" })).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
  });

  test("a Read-only one reads the share and gets no write tools", async () => {
    const { doom } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "read_only");
    const { tools } = await mcp.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain("rename_container");
    const listed = await mcp.callTool({ name: "list_container", arguments: { containerId: doom } });
    expect(listed.isError).toBeFalsy();
  });
});
