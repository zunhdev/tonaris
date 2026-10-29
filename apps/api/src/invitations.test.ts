// Sharing invitations through the API (FR-07.4–FR-07.6; DS-66, TS-33, TS-72): the email to the recipient's current
// address with its delivery recorded, a failure kept for Resend, no second email on a replay, the inbox and the email's
// page for the recipient and anyone else, and accepting into access.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { canReadContainer } from "@tonaris/db";
import {
  invitationListSchema,
  invitationStateSchema,
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
const annaEmail = "anna@example.com";

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie: denis } = await t.signIn("denis@example.com"));
  anna = await t.signIn(annaEmail);
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(
  mutation: Unsent,
  as: string,
  mutationId = uuidv7(),
): Promise<MutationResult["outcome"]> {
  const response = await t.call("/v1/mutations", {
    json: { mutationId, ...mutation },
    headers: { cookie: as },
  });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json()).outcome;
}

async function shared(): Promise<{ doom: string; grantId: string }> {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } }, denis);
  const doom = uuidv7();
  await send(
    { name: "container.create", args: { id: doom, kind: "list", parentId: null, name: "Doom" } },
    denis,
  );
  const grantId = uuidv7();
  await send(
    { name: "share.invite", args: { grantId, containerId: doom, email: annaEmail } },
    denis,
  );
  return { doom, grantId };
}

/** The invitation's delivery as the owner's dialog reads it, once it is no longer sending. */
async function delivery(doom: string): Promise<string | null | undefined> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const response = await t.call(`/v1/containers/${doom}/sharing`, { headers: { cookie: denis } });
    // oxlint-disable-next-line no-await-in-loop
    const status = shareSettingsSchema.parse(await response.json()).invitations[0]?.emailStatus;
    if (status !== "sending") return status;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(20);
  }
  return "sending";
}

const state = async (grantId: string, as: string) =>
  invitationStateSchema.parse(
    await (await t.call(`/v1/invitations/${grantId}`, { headers: { cookie: as } })).json(),
  );

describe("delivery (FR-07.5, TS-72)", () => {
  test("the recipient's address gets the invitation, linking to its page; the dialog says sent", async () => {
    const arrived = t.email.next(annaEmail);
    const { doom, grantId } = await shared();
    const email = await arrived;
    expect(email.subject).toBe(`Denis invited you to view "Doom" on Tonaris`);
    expect(email.text).toContain(`${t.config.webOrigin}/invitations/${grantId}`);
    expect(email.text).toContain("forwarding it gives no one access");
    expect(await delivery(doom)).toBe("sent");
  });

  test("a failed email keeps the invitation, and Resend sends it again; a replay sends nothing", async () => {
    t.email.failing.add(annaEmail);
    const { doom, grantId } = await shared();
    expect(await delivery(doom)).toBe("failed");
    expect((await state(grantId, anna.cookie)).state).toBe("pending");

    t.email.failing.delete(annaEmail);
    const resendId = uuidv7();
    const arrived = t.email.next(annaEmail);
    expect(
      await send({ name: "share.resendInvitation", args: { grantId } }, denis, resendId),
    ).toMatchObject({ status: "confirmed", result: { emailing: true } });
    await arrived;
    expect(await delivery(doom)).toBe("sent");
    await send({ name: "share.resendInvitation", args: { grantId } }, denis, resendId);
    await Bun.sleep(100);
    expect(t.email.sent.filter((each) => each.to === annaEmail)).toHaveLength(2);
  });
});

describe("answering (FR-07.6, DS-66)", () => {
  test("the inbox, the email's page, and accepting into access", async () => {
    const { doom, grantId } = await shared();
    const inbox = invitationListSchema.parse(
      await (await t.call("/v1/invitations", { headers: { cookie: anna.cookie } })).json(),
    );
    expect(inbox.invitations).toEqual([
      expect.objectContaining({
        id: grantId,
        owner: { displayName: "Denis" },
        container: { id: doom, name: "Doom", kind: "list" },
      }),
    ]);
    const { cookie: ben } = await t.signIn("ben@example.com");
    expect(await state(grantId, ben)).toEqual({ state: "wrong_account" });
    expect(await state(grantId, anna.cookie)).toMatchObject({ state: "pending" });
    expect(await canReadContainer(t.db, { kind: "person", userId: anna.id }, doom)).toBe(false);

    expect(await send({ name: "share.accept", args: { grantId } }, ben)).toMatchObject({
      status: "failed",
      code: "not_found",
    });
    expect(await send({ name: "share.accept", args: { grantId } }, anna.cookie)).toMatchObject({
      status: "confirmed",
    });
    expect(await canReadContainer(t.db, { kind: "person", userId: anna.id }, doom)).toBe(true);
    expect(await state(grantId, anna.cookie)).toMatchObject({ state: "accepted" });
    // Accepted, it is nobody else's business: unavailable to Ben.
    expect(await state(grantId, ben)).toEqual({ state: "unavailable" });
    const emptied = invitationListSchema.parse(
      await (await t.call("/v1/invitations", { headers: { cookie: anna.cookie } })).json(),
    );
    expect(emptied.invitations).toEqual([]);
  });

  test("a declined invitation is no longer available, and grants nothing", async () => {
    const { doom, grantId } = await shared();
    expect(await send({ name: "share.decline", args: { grantId } }, anna.cookie)).toMatchObject({
      status: "confirmed",
    });
    expect(await state(grantId, anna.cookie)).toEqual({ state: "unavailable" });
    expect(await state(uuidv7(), anna.cookie)).toEqual({ state: "unavailable" });
    expect(await canReadContainer(t.db, { kind: "person", userId: anna.id }, doom)).toBe(false);
  });
});
