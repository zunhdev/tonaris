// TS-106's hostile inputs (AC-45, Q-05; TON-95) through the app's API, the export and MCP:
// - XSS strings are saved and given back as the text they are, and the export's Markdown escapes them;
// - prompt injection in a description reaches an agent as data and changes nothing;
// - oversized inputs are refused before anything is saved, a request body over 4 MiB included;
// - lookalike names stay apart, and a lookalike address reaches no one else's account.
// SSRF has its fixtures against the guarded fetcher (packages/providers/src/safe-fetch.test.ts) and the image proxy
// (artwork.test.ts).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { strFromU8, unzipSync } from "fflate";

import {
  bootstrapSchema,
  exportSchema,
  invitationListSchema,
  maxAlbumTextLength,
  maxDescriptionLength,
  maxNameLength,
  mutationResultSchema,
  uuidv7,
  type Mutation,
} from "@tonaris/domain";
import adversarial from "@tonaris/domain/fixtures/adversarial.json";

import { maxRequestBodySize } from "./app";
import { mcpHarness } from "./mcp/testing";
import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie } = await t.signIn("ben@example.com"));
});

afterEach(async () => {
  await t.drop();
});

const { registerClient, connect, mcpClient } = mcpHarness(() => t);

/** A mutation without its ID, which `send` adds: each variant keeps its own `args` and `base`. */
type Unsent = Mutation extends infer Each
  ? Each extends Mutation
    ? Omit<Each, "mutationId">
    : never
  : never;

/** Text one character over `length`. */
const long = (length: number) => "x".repeat(length + 1);

/** Sends one mutation as `as`, and answers its outcome. */
async function send(mutation: Unsent, as = cookie) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: as },
  });
  return mutationResultSchema.parse(await response.json()).outcome;
}

async function confirmed(mutation: Unsent, as = cookie) {
  expect((await send(mutation, as)).status).toBe("confirmed");
}

const album = (title: string, artistCredit = "Sleep") => ({
  id: uuidv7(),
  title,
  artistCredit,
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1999,
  recordingYearStart: null,
  recordingYearEnd: null,
});

async function bootstrap(as = cookie) {
  const response = await t.call("/v1/sync/bootstrap", { headers: { cookie: as } });
  return bootstrapSchema.parse(await response.json());
}

describe("TS-106's hostile inputs", () => {
  test("XSS strings are saved and given back as text, and the export's Markdown escapes them", async () => {
    const list = uuidv7();
    const [name, description, title, label, value] = adversarial.xss;
    await confirmed({
      name: "container.create",
      args: { id: list, kind: "list", parentId: null, name: name! },
    });
    await confirmed({
      name: "container.describe",
      args: { id: list, description: description! },
      base: { description: null },
    });
    const record = album(title!);
    await confirmed({ name: "album.create", args: record });
    await confirmed({ name: "membership.add", args: { listId: list, albumId: record.id } });
    const field = uuidv7();
    await confirmed({
      name: "field.create",
      args: { id: field, name: label!, type: "text", options: [] },
    });
    await confirmed({ name: "fieldValue.apply", args: { albumId: record.id, fieldId: field } });
    await confirmed({
      name: "fieldValue.set",
      args: { albumId: record.id, fieldId: field, value: value! },
      base: { value: null },
    });

    const saved = await bootstrap();
    expect(saved.containers).toMatchObject([{ name, description }]);
    expect(saved.albums).toMatchObject([{ title }]);
    expect(saved.fields).toMatchObject([{ name: label }]);
    expect(saved.fieldValues).toMatchObject([{ value }]);

    const files = unzipSync(
      new Uint8Array(await (await t.call("/v1/export", { headers: { cookie } })).arrayBuffer()),
    );
    const data = exportSchema.parse(JSON.parse(strFromU8(files["tonaris-export.json"]!)));
    expect(data.albums[0]?.title).toBe(title);
    expect(data.tree.containers[0]).toMatchObject({ name, description });
    // Markdown would render a raw tag; every one is escaped.
    const markdown = strFromU8(files["collection.md"]!);
    for (const raw of [name, description, title, value]) expect(markdown).not.toContain(raw!);
    expect(markdown).toContain("\\<script\\>window.\\_\\_tonarisPwned = 1\\</script\\>");
  });

  test("prompt injection in a description reaches an agent as data, and changes nothing", async () => {
    const clientId = await registerClient();
    const { userId, cookie: anna, tokens } = await connect("anna@example.com", clientId, "manage");
    const list = uuidv7();
    await confirmed(
      { name: "container.create", args: { id: list, kind: "list", parentId: null, name: "Doom" } },
      anna,
    );
    let previous: string | null = null;
    for (const description of adversarial.injection) {
      // oxlint-disable-next-line no-await-in-loop -- each replaces the last
      await confirmed(
        {
          name: "container.describe",
          args: { id: list, description },
          base: { description: previous },
        },
        anna,
      );
      previous = description;
    }
    const before = (await bootstrap(anna)).seq;

    const mcp = await mcpClient(tokens.access_token);
    const listed = await mcp.callTool({ name: "list_container", arguments: { containerId: list } });
    expect(listed.structuredContent).toMatchObject({
      container: { id: list, description: adversarial.injection.at(-1) },
    });
    const overview = await mcp.callTool({ name: "get_overview", arguments: {} });
    expect(overview.structuredContent).toMatchObject({ trashUnits: 0 });
    expect((await bootstrap(anna)).seq).toBe(before);
    expect(userId).toBeString();
  });

  test("oversized inputs are refused before anything is saved", async () => {
    for (const mutation of [
      { name: "album.create", args: album(long(maxAlbumTextLength)) },
      { name: "album.create", args: album("Dopesmoker", long(maxAlbumTextLength)) },
      {
        name: "container.create",
        args: { id: uuidv7(), kind: "list", parentId: null, name: long(maxNameLength) },
      },
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time
      expect(await send(mutation)).toMatchObject({ status: "failed", code: "validation_failed" });
    }
    const list = uuidv7();
    await confirmed({
      name: "container.create",
      args: { id: list, kind: "list", parentId: null, name: "Doom" },
    });
    expect(
      await send({
        name: "container.describe",
        args: { id: list, description: long(maxDescriptionLength) },
        base: { description: null },
      }),
    ).toMatchObject({ status: "failed", code: "validation_failed" });
    const saved = await bootstrap();
    expect(saved.albums).toEqual([]);
    expect(saved.containers).toMatchObject([{ name: "Doom", description: null }]);

    // A body over the limit is refused before the API reads it.
    const url = t.listen();
    const refused = await fetch(`${url}/v1/mutations`, {
      method: "POST",
      headers: { cookie, origin: t.config.webOrigin, "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(maxRequestBodySize) }),
    });
    expect(refused.status).toBe(413);
  });

  test("lookalike names stay apart, and a lookalike address reaches no one else", async () => {
    const [latin, lookalike] = adversarial.confusables.names;
    const lists = [uuidv7(), uuidv7()];
    await confirmed({
      name: "container.create",
      args: { id: lists[0]!, kind: "list", parentId: null, name: latin! },
    });
    await confirmed({
      name: "container.create",
      args: { id: lists[1]!, kind: "list", parentId: null, name: lookalike! },
    });
    expect((await bootstrap()).containers.map((container) => container.name)).toEqual([
      latin!,
      lookalike!,
    ]);

    const { cookie: anna } = await t.signIn(adversarial.confusables.emails[0]!);
    // Sharing asks for a display name first (FR-11.3).
    await confirmed({ name: "account.setDisplayName", args: { displayName: "Ben" } });
    // The lookalike is no one's address; the real one reaches anna.
    const invite = (email: string) =>
      send({ name: "share.invite", args: { grantId: uuidv7(), containerId: lists[0]!, email } });
    expect(await invite(adversarial.confusables.emails[1]!)).toMatchObject({
      status: "failed",
      code: "recipient_not_found",
    });
    const pending = async () =>
      invitationListSchema.parse(
        await (await t.call("/v1/invitations", { headers: { cookie: anna } })).json(),
      );
    expect((await pending()).invitations).toEqual([]);
    expect((await invite(adversarial.confusables.emails[0]!)).status).toBe("confirmed");
    expect((await pending()).invitations).toHaveLength(1);
  });
});
