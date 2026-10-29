// Ending access through the API (FR-07.7, FR-07.10, FR-07.15, FR-07.16; AC-23): leaving keeps other people's access and
// the leaver's own link path, a new invitation starts pending, Trash recovery revives no withdrawn or revoked grant,
// and a link turned off and on again leaves references made through the old one inaccessible.

import { afterEach, beforeEach, expect, test } from "bun:test";

import { canReadContainer, savedReferences } from "@tonaris/db";
import {
  mutationResultSchema,
  shareSettingsSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let denis: string;
let anna: { id: string; cookie: string };
let ben: { id: string; cookie: string };

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie: denis } = await t.signIn("denis@example.com"));
  anna = await t.signIn("anna@example.com");
  ben = await t.signIn("ben@example.com");
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(mutation: Unsent, as: string): Promise<MutationResult["outcome"]> {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: as },
  });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json()).outcome;
}

const reads = (who: { id: string }, id: string) =>
  canReadContainer(t.db, { kind: "person", userId: who.id }, id);

/** "Metal" with the list "Doom" in it, shared with `people`, who accept. Answers the folder, list and grants. */
async function sharedMetal(...people: { id: string; cookie: string }[]) {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } }, denis);
  const [metal, doom] = [uuidv7(), uuidv7()];
  await send(
    {
      name: "container.create",
      args: { id: metal, kind: "folder", parentId: null, name: "Metal" },
    },
    denis,
  );
  await send(
    { name: "container.create", args: { id: doom, kind: "list", parentId: metal, name: "Doom" } },
    denis,
  );
  const grants: string[] = [];
  for (const person of people) {
    const grantId = uuidv7();
    const email = person === anna ? "anna@example.com" : "ben@example.com";
    // oxlint-disable-next-line no-await-in-loop
    await send({ name: "share.invite", args: { grantId, containerId: metal, email } }, denis);
    // oxlint-disable-next-line no-await-in-loop
    await send({ name: "share.accept", args: { grantId } }, person.cookie);
    grants.push(grantId);
  }
  return { metal, doom, grants };
}

/** Saves `containerId` to `who`'s references through the live link, as TON-68's "Add to Shared with me" will. */
async function saveThroughLink(who: { id: string }, containerId: string) {
  const settings = shareSettingsSchema.parse(
    await (
      await t.call(`/v1/containers/${containerId}/sharing`, { headers: { cookie: denis } })
    ).json(),
  );
  const linkId = settings.link?.id ?? null;
  await t.db
    .insert(savedReferences)
    .values({ viewerId: who.id, containerId, linkId })
    .onConflictDoUpdate({
      target: [savedReferences.viewerId, savedReferences.containerId],
      set: { linkId },
    });
}

test("leaving keeps other people's access and the leaver's link; a new invitation starts pending", async () => {
  const { metal, doom } = await sharedMetal(anna, ben);
  await send(
    { name: "share.setLink", args: { containerId: metal, linkId: uuidv7(), enabled: true } },
    denis,
  );
  expect(
    await send({ name: "share.leave", args: { containerId: metal } }, ben.cookie),
  ).toMatchObject({
    status: "confirmed",
  });
  expect(await reads(ben, doom)).toBe(false);
  expect(await reads(anna, doom)).toBe(true);
  const references = await t.db.select().from(savedReferences);
  expect(references.filter((each) => each.viewerId === ben.id)).toEqual([]);

  // Anna saved it through the link too: leaving the invitation keeps that path.
  await saveThroughLink(anna, metal);
  await send({ name: "share.leave", args: { containerId: metal } }, anna.cookie);
  expect(await reads(anna, doom)).toBe(true);

  expect(
    await send(
      {
        name: "share.invite",
        args: { grantId: uuidv7(), containerId: metal, email: "ben@example.com" },
      },
      denis,
    ),
  ).toMatchObject({ status: "confirmed", result: { status: "pending" } });
  expect(await reads(ben, metal)).toBe(false);
});

test("revoking blocks that path; Trash recovery revives neither revoked nor withdrawn grants", async () => {
  const { metal, doom, grants } = await sharedMetal(anna, ben);
  const [annaGrant] = grants;
  expect(
    await send({ name: "share.revoke", args: { grantId: annaGrant ?? "" } }, denis),
  ).toMatchObject({
    status: "confirmed",
  });
  expect(await reads(anna, metal)).toBe(false);
  expect(await reads(ben, metal)).toBe(true);
  await send({ name: "share.leave", args: { containerId: metal } }, ben.cookie);

  const unitId = uuidv7();
  await send({ name: "container.delete", args: { id: metal, unitId } }, denis);
  await send({ name: "trash.recover", args: { unitId } }, denis);
  expect(await reads(anna, doom)).toBe(false);
  expect(await reads(ben, doom)).toBe(false);
  const settings = shareSettingsSchema.parse(
    await (await t.call(`/v1/containers/${metal}/sharing`, { headers: { cookie: denis } })).json(),
  );
  expect(settings.invitations).toEqual([]);
});

test("a link turned off and on again doesn't revive references saved through the old one", async () => {
  const { metal } = await sharedMetal();
  await send(
    { name: "share.setLink", args: { containerId: metal, linkId: uuidv7(), enabled: true } },
    denis,
  );
  await saveThroughLink(anna, metal);
  expect(await reads(anna, metal)).toBe(true);
  await send(
    { name: "share.setLink", args: { containerId: metal, linkId: uuidv7(), enabled: false } },
    denis,
  );
  await send(
    { name: "share.setLink", args: { containerId: metal, linkId: uuidv7(), enabled: true } },
    denis,
  );
  expect(await reads(anna, metal)).toBe(false);
  // Saved again through the new link, the same reference opens it.
  await saveThroughLink(anna, metal);
  expect(await reads(anna, metal)).toBe(true);
  const references = await t.db.select().from(savedReferences);
  expect(references.filter((each) => each.viewerId === anna.id)).toHaveLength(1);
});
