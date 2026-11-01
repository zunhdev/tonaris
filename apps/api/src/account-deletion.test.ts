// Deleting an account (FR-11.10, FR-11.11, TS-74, AC-40 but its export offer) against the real app and a fresh
// test schema: the typed email confirms, and the creator can't; access, sharing and AI connections stop at once;
// the job removes the account's data and leaves another member's; its address then reaches no account; and a
// failed deletion is retried.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import {
  admissionInvitations,
  albums,
  containers,
  oauthClients,
  oauthConsents,
  users,
} from "@tonaris/db";
import {
  accountDeletionProgressSchema,
  accountDeletionRefusalDetails as refusals,
  type Mutation,
  mutationResultSchema,
  shareSettingsSchema,
  uuidv7,
} from "@tonaris/domain";

import { createTestApp, insertUser } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let anna: { id: string; cookie: string };
let ben: { id: string; cookie: string };

beforeEach(async () => {
  t = await createTestApp();
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

async function send(mutation: Unsent, cookie: string) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie },
  });
  const { outcome } = mutationResultSchema.parse(await response.json());
  expect(outcome.status).toBe("confirmed");
  return outcome;
}

/** `cookie`'s list `name` with one album; answers its ID. */
async function list(name: string, cookie: string): Promise<string> {
  const id = uuidv7();
  await send(
    { name: "container.create", args: { id, kind: "list", parentId: null, name } },
    cookie,
  );
  const album = uuidv7();
  await send(
    {
      name: "album.create",
      args: {
        id: album,
        title: `${name} album`,
        artistCredit: "Candlemass",
        releaseType: "album",
        isLive: false,
        originalYear: 1987,
        recordingYearStart: null,
        recordingYearEnd: null,
      },
    },
    cookie,
  );
  await send({ name: "membership.add", args: { listId: id, albumId: album } }, cookie);
  return id;
}

/** Anna's "Doom", shared with Ben by invitation and with everyone by link; answers the list and the link's token. */
async function annaShares(): Promise<{ doom: string; token: string }> {
  await send({ name: "account.setDisplayName", args: { displayName: "Anna" } }, anna.cookie);
  const doom = await list("Doom", anna.cookie);
  const grantId = uuidv7();
  await send(
    { name: "share.invite", args: { grantId, containerId: doom, email: "ben@example.com" } },
    anna.cookie,
  );
  await send({ name: "share.accept", args: { grantId } }, ben.cookie);
  await send(
    { name: "share.setLink", args: { containerId: doom, linkId: uuidv7(), enabled: true } },
    anna.cookie,
  );
  const settings = shareSettingsSchema.parse(
    await (
      await t.call(`/v1/containers/${doom}/sharing`, { headers: { cookie: anna.cookie } })
    ).json(),
  );
  return { doom, token: settings.link?.url.split("/s/")[1] ?? "" };
}

const confirm = (email: string, cookie = anna.cookie) =>
  t.call("/v1/account/deletion", { json: { email }, headers: { cookie } });

const problem = async (response: Response) =>
  z.object({ code: z.string(), detail: z.string() }).parse(await response.json());

async function progress(token: string) {
  const response = await t.call("/auth/account-deletion/progress", { json: { token } });
  return accountDeletionProgressSchema.parse(await response.json()).status;
}

/** Polls the deletion until it is no longer running. */
async function finished(token: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const status = await progress(token);
    if (status !== "deleting") return status;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(20);
  }
  return "deleting";
}

/** The ledger's first event of `type`, once the worker has written it. */
async function ledgered(type: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const event = t.ledger.appended.find((each) => each.type === type);
    if (event) return event;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(20);
  }
  return undefined;
}

async function tokenOf(response: Response): Promise<string> {
  expect(response.status).toBe(200);
  return z.object({ token: z.string() }).parse(await response.json()).token;
}

describe("confirming (FR-11.10)", () => {
  test("needs the sign-in email typed, and the creator can't", async () => {
    const refused = await confirm("someone@example.com");
    expect(refused.status).toBe(422);
    expect((await problem(refused)).detail).toBe(refusals.mismatch);
    expect((await t.call("/v1/me", { headers: { cookie: anna.cookie } })).status).toBe(200);

    await insertUser(t.db, "creator@example.com", { role: "creator" });
    const creator = await t.signIn("creator@example.com");
    const creatorRefused = await confirm("creator@example.com", creator.cookie);
    expect((await problem(creatorRefused)).detail).toBe(refusals.creator);

    const bearer = await t.call("/v1/account/deletion", {
      json: { email: "anna@example.com" },
      headers: { authorization: "Bearer mcp-token" },
    });
    expect(bearer.status).toBe(401);
  });
});

describe("deleting (FR-11.11)", () => {
  test("access, sharing and AI connections stop at once, then all of Anna's data goes, and Ben's stays", async () => {
    const { doom, token: linkToken } = await annaShares();
    const bens = await list("Ben's own", ben.cookie);
    await t.db.insert(oauthClients).values({ id: uuidv7(), clientId: "c", redirectUris: [] });
    await t.db
      .insert(oauthConsents)
      .values({ id: uuidv7(), clientId: "c", userId: anna.id, scopes: ["collection:read"] });
    expect((await t.call(`/v1/s/${linkToken}`)).status).toBe(200);
    const stream = await t.openStream(anna.cookie);

    const token = await tokenOf(await confirm(" Anna@Example.com "));

    expect((await t.call("/v1/me", { headers: { cookie: anna.cookie } })).status).toBe(401);
    // Her stream ends at once, not at the next session check (TS-23).
    expect(await stream.endsWithin(1_000)).toBe(true);
    expect((await t.call(`/v1/s/${linkToken}`)).status).toBe(404);
    expect((await t.call(`/v1/shared/${doom}`, { headers: { cookie: ben.cookie } })).status).toBe(
      404,
    );
    expect(await t.db.select().from(oauthConsents)).toEqual([]);

    expect(await finished(token)).toBe("deleted");
    expect((await t.db.select().from(users)).map((user) => user.email)).toEqual([
      "ben@example.com",
    ]);
    expect((await t.db.select().from(containers)).map((row) => row.id)).toEqual([bens]);
    expect((await t.db.select().from(albums)).map((row) => row.ownerId)).toEqual([ben.id]);
    expect((await t.call("/v1/me", { headers: { cookie: ben.cookie } })).status).toBe(200);
    // The revocation ledger has it, off-site, so a restored backup deletes it again (TS-113).
    expect(await ledgered("account.deleted")).toMatchObject({ userId: anna.id });
  });

  test("the address then reaches no account, and signing in recreates nothing", async () => {
    const token = await tokenOf(await confirm("anna@example.com"));
    // At once, before the data is gone, the address has no account.
    const noAccount = t.email.next("anna@example.com");
    await t.call("/auth/email-otp/send-verification-otp", {
      json: { email: "anna@example.com", type: "sign-in" },
    });
    expect((await noAccount).template).toBe("sign-in-no-account");
    expect(await finished(token)).toBe("deleted");
    expect((await t.db.select().from(users)).some((user) => user.id === anna.id)).toBe(false);
  });

  test("a failed deletion reports failed, and Retry finishes it", async () => {
    // Something the job can't remove, as a stand-in for a failure: an invitation Anna issued.
    await t.db.insert(admissionInvitations).values({
      id: uuidv7(),
      emailKey: "carl@example.com",
      tokenHash: Buffer.from("x"),
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: anna.id,
    });
    const token = await tokenOf(await confirm("anna@example.com"));
    expect(await finished(token)).toBe("failed");

    await t.db.delete(admissionInvitations);
    const retried = await t.call("/auth/account-deletion/retry", { json: { token } });
    expect(accountDeletionProgressSchema.parse(await retried.json()).status).toBe("deleting");
    expect(await finished(token)).toBe("deleted");
  });

  test("an unknown token has no progress", async () => {
    const response = await t.call("/auth/account-deletion/progress", { json: { token: "nope" } });
    expect(response.status).toBe(404);
    expect((await problem(response)).detail).toBe(refusals.none);
  });
});
