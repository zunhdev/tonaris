// Sharing through the API (FR-07.1, FR-07.4, FR-07.5, FR-07.14, FR-07.16, FR-11.3; DS-65, TS-32, TS-34): invitations
// for members, the owner's dialog read with its link, the link's token opening exactly that link until it is turned
// off, inherited access, and the display name kept while sharing.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { findShareLink } from "@tonaris/db";
import {
  mutationResultSchema,
  shareSettingsSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie } = await t.signIn("denis@example.com"));
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(mutation: Unsent, as = cookie): Promise<MutationResult["outcome"]> {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: as },
  });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json()).outcome;
}

async function settings(id: string, as = cookie) {
  const response = await t.call(`/v1/containers/${id}/sharing`, { headers: { cookie: as } });
  return {
    status: response.status,
    body: response.ok ? shareSettingsSchema.parse(await response.json()) : undefined,
  };
}

async function made(kind: "folder" | "list", name: string, parentId: string | null = null) {
  const id = uuidv7();
  expect(
    (
      await send({
        name: "container.create",
        args: { id, kind, parentId, name },
      })
    ).status,
  ).toBe("confirmed");
  return id;
}

const named = () => send({ name: "account.setDisplayName", args: { displayName: "Denis" } });

describe("sharing (DS-65)", () => {
  test("invite a member and see them pending; nobody else, and never twice", async () => {
    await t.signIn("anna@example.com");
    const doom = await made("list", "Doom");
    expect(
      await send({
        name: "share.invite",
        args: { grantId: uuidv7(), containerId: doom, email: "anna@example.com" },
      }),
    ).toMatchObject({ status: "failed", code: "display_name_required" });
    await named();

    const grantId = uuidv7();
    expect(
      await send({
        name: "share.invite",
        args: { grantId, containerId: doom, email: "Anna@Example.com" },
      }),
    ).toMatchObject({ status: "confirmed", result: { grantId, status: "pending" } });
    expect(
      await send({
        name: "share.invite",
        args: { grantId: uuidv7(), containerId: doom, email: "anna@example.com" },
      }),
    ).toMatchObject({ result: { grantId } });
    expect(
      await send({
        name: "share.invite",
        args: { grantId: uuidv7(), containerId: doom, email: "nobody@example.com" },
      }),
    ).toMatchObject({ status: "failed", code: "recipient_not_found" });

    const { body } = await settings(doom);
    expect(body).toEqual({
      containerId: doom,
      ownerDisplayName: "Denis",
      invitations: [
        {
          id: grantId,
          email: "Anna@Example.com",
          displayName: null,
          status: "pending",
          emailStatus: null,
        },
      ],
      link: null,
      inherited: [],
    });
  });

  test("the link's URL is the same each time and opens it; off, it opens nothing, and on again is new", async () => {
    await named();
    const doom = await made("list", "Doom");
    const linkId = uuidv7();
    expect(
      await send({ name: "share.setLink", args: { containerId: doom, linkId, enabled: true } }),
    ).toMatchObject({
      status: "confirmed",
      result: { linkId },
    });
    const first = (await settings(doom)).body?.link;
    expect(first?.id).toBe(linkId);
    expect(first?.url).toMatch(new RegExp(`^${t.config.webOrigin}/s/[A-Za-z0-9_-]{43}$`));
    expect((await settings(doom)).body?.link).toEqual(first);
    const token = first?.url.split("/s/")[1] ?? "";
    expect(await findShareLink(t.db, token)).toEqual({ id: linkId, containerId: doom });

    await send({
      name: "share.setLink",
      args: { containerId: doom, linkId: uuidv7(), enabled: false },
    });
    expect((await settings(doom)).body?.link).toBeNull();
    expect(await findShareLink(t.db, token)).toBeUndefined();
    const again = uuidv7();
    await send({
      name: "share.setLink",
      args: { containerId: doom, linkId: again, enabled: true },
    });
    expect((await settings(doom)).body?.link?.id).toBe(again);
    expect((await settings(doom)).body?.link?.url).not.toBe(first?.url);
  });

  test("access from folders above, nearest first", async () => {
    await named();
    await t.signIn("anna@example.com");
    await t.signIn("ben@example.com");
    const metal = await made("folder", "Metal");
    const funeral = await made("folder", "Funeral", metal);
    const deep = await made("list", "Deep", funeral);
    await send({
      name: "share.setLink",
      args: { containerId: metal, linkId: uuidv7(), enabled: true },
    });
    for (const email of ["anna@example.com", "ben@example.com"]) {
      // oxlint-disable-next-line no-await-in-loop
      await send({
        name: "share.invite",
        args: { grantId: uuidv7(), containerId: funeral, email },
      });
    }
    expect((await settings(deep)).body?.inherited).toEqual([
      { containerId: funeral, name: "Funeral", people: 2, link: false },
      { containerId: metal, name: "Metal", people: 0, link: true },
    ]);
  });

  test("the display name stays while sharing", async () => {
    await named();
    const doom = await made("list", "Doom");
    await send({
      name: "share.setLink",
      args: { containerId: doom, linkId: uuidv7(), enabled: true },
    });
    expect(
      await send({ name: "account.setDisplayName", args: { displayName: " " } }),
    ).toMatchObject({
      status: "failed",
      code: "display_name_required",
    });
    const me = await t.call("/v1/me", { headers: { cookie } });
    expect(await me.json()).toMatchObject({ displayName: "Denis" });
    await send({
      name: "share.setLink",
      args: { containerId: doom, linkId: uuidv7(), enabled: false },
    });
    expect(
      await send({ name: "account.setDisplayName", args: { displayName: null } }),
    ).toMatchObject({
      status: "confirmed",
    });
  });

  test("someone else's folder or list is not found", async () => {
    const doom = await made("list", "Doom");
    const { cookie: anna } = await t.signIn("anna@example.com");
    expect((await settings(doom, anna)).status).toBe(404);
    expect((await settings(uuidv7())).status).toBe(404);
    expect(
      await send(
        { name: "share.setLink", args: { containerId: doom, linkId: uuidv7(), enabled: true } },
        anna,
      ),
    ).toMatchObject({ status: "failed", code: "permission_denied" });
  });
});
