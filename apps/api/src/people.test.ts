// A person's people through the API (FR-07.23, FR-07.3, FR-07.4; TON-294): `GET /v1/people` both ways, with the
// email of someone who invited you never sent, and `share.invite` by person, refused for anyone else as an address
// with no account is.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  mutationResultSchema,
  ownFavoritesSchema,
  peopleSchema,
  personSharesSchema,
  shareSettingsSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(cookie: string, mutation: Unsent): Promise<MutationResult["outcome"]> {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json()).outcome;
}

/** Signs in with a display name and one list, ready to share. */
async function member(address: string, displayName: string, list: string) {
  const { id, cookie } = await t.signIn(address);
  await send(cookie, { name: "account.setDisplayName", args: { displayName } });
  const listId = uuidv7();
  await send(cookie, {
    name: "container.create",
    args: { id: listId, kind: "list", parentId: null, name: list },
  });
  return { id, cookie, listId };
}

async function peopleOf(cookie: string) {
  const response = await t.call("/v1/people", { headers: { cookie } });
  expect(response.status).toBe(200);
  return peopleSchema.parse(await response.json()).people;
}

describe("people (FR-07.23)", () => {
  test("both ways: the typed address for people you invited, the name only for those who invited you", async () => {
    const denis = await member("denis@example.com", "Denis", "Doom");
    const anna = await member("anna@example.com", "Anna", "Jazz");
    const ben = await member("ben@example.com", "Ben", "Folk");

    // Denis invites Anna, as he typed her address.
    await send(denis.cookie, {
      name: "share.invite",
      args: { grantId: uuidv7(), containerId: denis.listId, email: "Anna@Example.com" },
    });
    // Ben invites Denis; Denis hasn't answered, so Ben isn't his yet.
    const fromBen = uuidv7();
    await send(ben.cookie, {
      name: "share.invite",
      args: { grantId: fromBen, containerId: ben.listId, email: "denis@example.com" },
    });
    expect((await peopleOf(denis.cookie)).map((person) => person.displayName)).toEqual(["Anna"]);

    await send(denis.cookie, { name: "share.accept", args: { grantId: fromBen } });
    const listed = await peopleOf(denis.cookie);
    expect(listed).toEqual([
      {
        id: ben.id,
        displayName: "Ben",
        avatarHue: null,
        email: null,
        sharedAt: expect.any(String),
        sharesWithYou: "Folk",
        yours: { folders: 0, lists: 0, toEdit: 0 },
        theirs: { folders: 0, lists: 1 },
      },
      {
        id: anna.id,
        displayName: "Anna",
        avatarHue: null,
        email: "Anna@Example.com",
        sharedAt: expect.any(String),
        sharesWithYou: null,
        yours: { folders: 0, lists: 1, toEdit: 0 },
        theirs: { folders: 0, lists: 0 },
      },
    ]);
    // Ben's email is never sent to Denis (FR-07.3).
    expect(JSON.stringify(listed)).not.toContain("ben@example.com");

    // Anna sees Denis only once she accepts; Ben sees Denis, whom he invited.
    expect(await peopleOf(anna.cookie)).toEqual([]);
    expect((await peopleOf(ben.cookie)).map((person) => person.email)).toEqual([
      "denis@example.com",
    ]);
  });

  test("share back by person: no address recorded, and the email goes to their account", async () => {
    const denis = await member("denis@example.com", "Denis", "Doom");
    const anna = await member("anna@example.com", "Anna", "Jazz");
    const fromAnna = uuidv7();
    await send(anna.cookie, {
      name: "share.invite",
      args: { grantId: fromAnna, containerId: anna.listId, email: "denis@example.com" },
    });
    await send(denis.cookie, { name: "share.accept", args: { grantId: fromAnna } });

    const grantId = uuidv7();
    const arrived = t.email.next("anna@example.com");
    expect(
      await send(denis.cookie, {
        name: "share.invite",
        args: { grantId, containerId: denis.listId, personId: anna.id, role: "edit" },
      }),
    ).toMatchObject({ status: "confirmed", result: { grantId, status: "pending", role: "edit" } });
    const response = await t.call(`/v1/containers/${denis.listId}/sharing`, {
      headers: { cookie: denis.cookie },
    });
    const { invitations } = shareSettingsSchema.parse(await response.json());
    expect(invitations).toMatchObject([{ id: grantId, personId: anna.id, email: null }]);
    expect(JSON.stringify(invitations)).not.toContain("anna@example.com");
    expect((await arrived).subject).toBe(`Denis invited you to edit "Doom" on Tonaris`);
  });

  test("a stranger's id, one's own, and a declined one's answer as an address with no account", async () => {
    const denis = await member("denis@example.com", "Denis", "Doom");
    const anna = await member("anna@example.com", "Anna", "Jazz");
    const ben = await member("ben@example.com", "Ben", "Folk");
    const toBen = uuidv7();
    await send(denis.cookie, {
      name: "share.invite",
      args: { grantId: toBen, containerId: denis.listId, email: "ben@example.com" },
    });
    await send(ben.cookie, { name: "share.decline", args: { grantId: toBen } });

    const answers = await Promise.all(
      [anna.id, denis.id, ben.id, uuidv7()].map((personId) =>
        send(denis.cookie, {
          name: "share.invite",
          args: { grantId: uuidv7(), containerId: denis.listId, personId },
        }),
      ),
    );
    for (const answer of answers) {
      expect(answer).toMatchObject({
        status: "failed",
        code: "recipient_not_found",
        problem: {
          detail: "This person can't be invited. Invite them by email instead.",
          errors: [{ path: "args.personId", message: "Not one of your people" }],
        },
      });
    }
    expect(await peopleOf(denis.cookie)).toEqual([]);
  });

  test("signed out, nothing", async () => {
    expect((await t.call("/v1/people")).status).toBe(401);
    expect((await t.call(`/v1/people/${uuidv7()}`)).status).toBe(401);
  });
});

/** A person's page, as `cookie`'s account reads it. */
async function page(cookie: string, id: string) {
  const response = await t.call(`/v1/people/${id}`, { headers: { cookie } });
  return {
    status: response.status,
    body: response.ok ? personSharesSchema.parse(await response.json()) : undefined,
  };
}

describe("a person's page (FR-07.24)", () => {
  test("both ways by name; stop sharing revokes yours only; removing hides until a new invitation", async () => {
    const denis = await member("denis@example.com", "Denis", "Doom");
    const anna = await member("anna@example.com", "Anna", "Jazz");
    const toAnna = uuidv7();
    await send(denis.cookie, {
      name: "share.invite",
      args: { grantId: toAnna, containerId: denis.listId, email: "anna@example.com", role: "edit" },
    });
    await send(anna.cookie, { name: "share.accept", args: { grantId: toAnna } });
    const fromAnna = uuidv7();
    await send(anna.cookie, {
      name: "share.invite",
      args: { grantId: fromAnna, containerId: anna.listId, email: "denis@example.com" },
    });
    await send(denis.cookie, { name: "share.accept", args: { grantId: fromAnna } });

    const { body } = await page(denis.cookie, anna.id);
    expect(body?.yours).toEqual([
      {
        grantId: toAnna,
        containerId: denis.listId,
        name: "Doom",
        kind: "list",
        role: "edit",
        status: "accepted",
      },
    ]);
    expect(body?.theirs).toMatchObject([{ grantId: fromAnna, name: "Jazz", status: "accepted" }]);
    expect((await page(denis.cookie, uuidv7())).status).toBe(404);

    // Stop sharing: Denis's invitation is revoked; Anna's to him stays.
    expect(
      await send(denis.cookie, { name: "share.revokePerson", args: { personId: anna.id } }),
    ).toMatchObject({ status: "confirmed", result: { revoked: 1 } });
    const after = await page(denis.cookie, anna.id);
    expect(after.body?.yours).toEqual([]);
    expect(after.body?.theirs).toHaveLength(1);

    // Remove from People: gone, until he invites her again.
    await send(denis.cookie, { name: "people.remove", args: { personId: anna.id } });
    expect(await peopleOf(denis.cookie)).toEqual([]);
    expect((await page(denis.cookie, anna.id)).status).toBe(404);
    await send(denis.cookie, {
      name: "share.invite",
      args: { grantId: uuidv7(), containerId: denis.listId, email: "anna@example.com" },
    });
    expect((await peopleOf(denis.cookie)).map((person) => person.id)).toEqual([anna.id]);
  });
});

describe("profiles (FR-11.16)", () => {
  test("the account carries its color and About; a person's About shows to their people only", async () => {
    const denis = await member("denis@example.com", "Denis", "Doom");
    const anna = await member("anna@example.com", "Anna", "Jazz");
    await send(anna.cookie, { name: "account.setAvatarColor", args: { avatarHue: 120 } });
    await send(anna.cookie, { name: "account.setAbout", args: { about: "Jazz, mostly." } });
    const me = await t.call("/v1/me", { headers: { cookie: anna.cookie } });
    expect(await me.json()).toMatchObject({ avatarHue: 120, about: "Jazz, mostly." });

    // Denis invites Anna: she's one of his people, but he isn't hers until she accepts.
    const toAnna = uuidv7();
    await send(denis.cookie, {
      name: "share.invite",
      args: { grantId: toAnna, containerId: denis.listId, email: "anna@example.com" },
    });
    const annaFor = async (cookie: string) => (await page(cookie, anna.id)).body;
    expect(await annaFor(denis.cookie)).toMatchObject({
      person: { avatarHue: 120 },
      about: null,
    });
    await send(anna.cookie, { name: "share.accept", args: { grantId: toAnna } });
    expect((await annaFor(denis.cookie))?.about).toBe("Jazz, mostly.");

    // Removed from her People, he no longer sees it.
    await send(anna.cookie, { name: "people.remove", args: { personId: denis.id } });
    expect((await annaFor(denis.cookie))?.about).toBeNull();
  });
});

describe("favorite albums (FR-11.16, TON-297)", () => {
  test("the person's own list with signed artwork; their people see title, artist and cover", async () => {
    const denis = await member("denis@example.com", "Denis", "Doom");
    const anna = await member("anna@example.com", "Anna", "Jazz");
    const nightfall = uuidv7();
    await send(anna.cookie, {
      name: "album.create",
      args: {
        id: nightfall,
        title: "Nightfall",
        artistCredit: "Candlemass",
        releaseType: "album",
        isLive: false,
        originalYear: 1987,
        recordingYearStart: null,
        recordingYearEnd: null,
      },
    });
    await send(anna.cookie, {
      name: "album.setArtwork",
      args: { id: nightfall, artworkUrl: "https://coverartarchive.org/release/x/front-500.jpg" },
      base: { artworkUrl: null },
    });
    // Someone else's album is refused.
    expect(
      await send(denis.cookie, { name: "account.setFavorites", args: { albumIds: [nightfall] } }),
    ).toMatchObject({ status: "failed", code: "not_found" });
    expect(
      await send(anna.cookie, { name: "account.setFavorites", args: { albumIds: [nightfall] } }),
    ).toMatchObject({ status: "confirmed" });
    const own = ownFavoritesSchema.parse(
      await (await t.call("/v1/me/favorites", { headers: { cookie: anna.cookie } })).json(),
    );
    expect(own.favorites).toEqual([
      {
        albumId: nightfall,
        title: "Nightfall",
        artistCredit: "Candlemass",
        artworkUrl: "https://coverartarchive.org/release/x/front-500.jpg",
        artworkSignature: expect.any(String),
        trashed: false,
      },
    ]);

    // Anna invites Denis, who accepts: he's one of her people.
    const toDenis = uuidv7();
    await send(anna.cookie, {
      name: "share.invite",
      args: { grantId: toDenis, containerId: anna.listId, email: "denis@example.com" },
    });
    await send(denis.cookie, { name: "share.accept", args: { grantId: toDenis } });
    expect((await page(denis.cookie, anna.id)).body?.favorites).toEqual([
      {
        title: "Nightfall",
        artistCredit: "Candlemass",
        artworkUrl: "https://coverartarchive.org/release/x/front-500.jpg",
        artworkSignature: expect.any(String),
      },
    ]);
    expect((await t.call("/v1/me/favorites")).status).toBe(401);
  });
});
