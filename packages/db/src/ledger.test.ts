// The revocation ledger against the local Postgres 18 (TS-113, Q-04): each deletion-class change queues its event in
// its own transaction; the file store keeps each event once, in order; and the replay applies events to a
// restored database, idempotently: the account, the connection, the link, the grant, the Trash unit, the
// admission and the passkey stay gone.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { eq } from "drizzle-orm";

import {
  ledgerEventSchema,
  ledgerJobKind,
  uuidv7,
  type LedgerEvent,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { createAdmissionInvitation, revokeAdmissionInvitation } from "./admission";
import { ledgerStore } from "./ledger";
import { replayLedger } from "./ledger-replay";
import { revokeConnection } from "./mcp";
import { removePasskey } from "./passkeys";
import {
  admissionInvitations,
  albums,
  containers,
  jobs,
  oauthClients,
  oauthConsents,
  passkeys,
  shareGrants,
  shareLinks,
  trashUnits,
  users,
} from "./schema";
import { executeMutation } from "./sync";
import { createTestDatabase, insertPasskey, type TestDatabase } from "./testing";

let t: TestDatabase;
let anna: Principal & { kind: "user" };
let ben: string;
let cleo: string;

beforeEach(async () => {
  t = await createTestDatabase();
  const userId = uuidv7();
  ben = uuidv7();
  cleo = uuidv7();
  await t.db.insert(users).values([
    { id: userId, email: "anna@example.com", displayName: "Anna", role: "creator" },
    { id: ben, email: "ben@example.com" },
    { id: cleo, email: "cleo@example.com" },
  ]);
  anna = { kind: "user", userId, role: "creator", client: "web" };
});

afterEach(async () => {
  await t.drop();
});

async function run(mutation: Mutation) {
  const { result } = await executeMutation(t.db, anna, mutation);
  expect(result.outcome).toMatchObject({ status: "confirmed" });
}

/** The events the ledger jobs carry, oldest first. */
async function queued(): Promise<LedgerEvent[]> {
  const rows = await t.db.select().from(jobs).where(eq(jobs.kind, ledgerJobKind));
  return rows
    .map((row) => ledgerEventSchema.parse(row.payload))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

const passkey = (userId: string) => insertPasskey(t.db, userId);

async function list(name: string) {
  const id = uuidv7();
  await run({
    mutationId: uuidv7(),
    name: "container.create",
    args: { id, kind: "list", parentId: null, name },
  });
  return id;
}

describe("recording", () => {
  test("revoking a link, a grant, a connection and an admission, purging Trash, and removing a passkey each queue an event", async () => {
    const doom = await list("Doom");
    // Made directly: making one needs the share secret, which the API holds (its sharing tests make them).
    const linkId = uuidv7();
    await t.db
      .insert(shareLinks)
      .values({ id: linkId, containerId: doom, tokenHash: Buffer.from("link") });
    await run({
      mutationId: uuidv7(),
      name: "share.setLink",
      args: { containerId: doom, linkId: uuidv7(), enabled: false },
    });
    const grantId = uuidv7();
    await t.db.insert(shareGrants).values({
      id: grantId,
      containerId: doom,
      granteeId: ben,
      invitedEmail: "ben@example.com",
      status: "accepted",
    });
    await run({ mutationId: uuidv7(), name: "share.revoke", args: { grantId } });
    await t.db.insert(oauthClients).values({ id: uuidv7(), clientId: "c", redirectUris: [] });
    const consent = uuidv7();
    await t.db
      .insert(oauthConsents)
      .values({ id: consent, clientId: "c", userId: anna.userId, scopes: [] });
    expect(await revokeConnection(t.db, { userId: anna.userId, id: consent })).toBe(true);
    const invitationId = uuidv7();
    await createAdmissionInvitation(t.db, {
      id: invitationId,
      emailKey: "dee@example.com",
      tokenHash: Buffer.from("token"),
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: anna.userId,
      emailStatus: "sending",
    });
    await revokeAdmissionInvitation(t.db, invitationId);
    const unitId = uuidv7();
    await run({ mutationId: uuidv7(), name: "container.delete", args: { id: doom, unitId } });
    await run({ mutationId: uuidv7(), name: "trash.purge", args: { unitIds: [unitId] } });
    const passkeyId = await passkey(anna.userId);
    expect(await removePasskey(t.db, { userId: ben, id: passkeyId })).toBe(false);
    expect(await removePasskey(t.db, { userId: anna.userId, id: passkeyId })).toBe(true);

    expect((await queued()).map(({ id: _id, at: _at, ...event }) => event)).toEqual([
      { type: "shareLink.revoked", linkId },
      { type: "shareGrant.ended", grantId, status: "revoked" },
      { type: "connection.revoked", userId: anna.userId, clientId: "c" },
      { type: "admission.revoked", invitationId },
      { type: "trash.purged", unitId, containerIds: [doom], albumIds: [] },
      { type: "passkey.removed", userId: anna.userId, passkeyId },
    ]);
  });
});

describe("the file store", () => {
  test("keeps each event once, in the order they happened", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ledger-"));
    try {
      const store = ledgerStore(pathToFileURL(dir).href);
      const first: LedgerEvent = {
        id: uuidv7(),
        at: "2026-10-30T10:00:00.000Z",
        type: "shareLink.revoked",
        linkId: uuidv7(),
      };
      const second: LedgerEvent = {
        id: uuidv7(),
        at: "2026-11-01T10:00:00.000Z",
        type: "admission.revoked",
        invitationId: uuidv7(),
      };
      await store.append(second);
      await store.append(first);
      // A retried append writes it again.
      await store.append(first);
      expect(await store.events()).toEqual([first, second]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the replay", () => {
  test("brings a restored database past the events, and a second replay changes nothing", async () => {
    // The state as a backup held it: a live link and grant, a Trash unit, a connection, an invitation, passkeys.
    const doom = await list("Doom");
    const kept = await list("Kept");
    const linkId = uuidv7();
    await t.db
      .insert(shareLinks)
      .values({ id: linkId, containerId: kept, tokenHash: Buffer.from("link") });
    const grantId = uuidv7();
    await t.db.insert(shareGrants).values({
      id: grantId,
      containerId: kept,
      granteeId: ben,
      invitedEmail: "ben@example.com",
      status: "pending",
    });
    const unitId = uuidv7();
    await run({ mutationId: uuidv7(), name: "container.delete", args: { id: doom, unitId } });
    await t.db.insert(oauthClients).values({ id: uuidv7(), clientId: "c", redirectUris: [] });
    await t.db
      .insert(oauthConsents)
      .values({ id: uuidv7(), clientId: "c", userId: anna.userId, scopes: [] });
    const invitationId = uuidv7();
    await createAdmissionInvitation(t.db, {
      id: invitationId,
      emailKey: "dee@example.com",
      tokenHash: Buffer.from("token"),
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: anna.userId,
      emailStatus: "sending",
    });
    const removedPasskey = await passkey(anna.userId);
    const keptPasskey = await passkey(anna.userId);
    await passkey(ben);
    const cleosAlbum = uuidv7();
    await t.db.insert(albums).values({
      id: cleosAlbum,
      ownerId: cleo,
      title: "Cleo's",
      artistCredit: "Cleo",
      originalYear: 2000,
      searchTitleKey: "cleo's",
      searchArtistKey: "cleo",
    });

    // What the ledger recorded after it.
    const at = new Date().toISOString();
    const events: LedgerEvent[] = [
      { id: uuidv7(), at, type: "shareLink.revoked", linkId },
      { id: uuidv7(), at, type: "shareGrant.ended", grantId, status: "revoked" },
      { id: uuidv7(), at, type: "trash.purged", unitId, containerIds: [doom], albumIds: [] },
      { id: uuidv7(), at, type: "connection.revoked", userId: anna.userId, clientId: null },
      { id: uuidv7(), at, type: "admission.revoked", invitationId },
      { id: uuidv7(), at, type: "account.deleted", userId: cleo },
      { id: uuidv7(), at, type: "passkey.removed", userId: anna.userId, passkeyId: removedPasskey },
      { id: uuidv7(), at, type: "passkey.removed", userId: ben, passkeyId: null },
    ];
    expect(await replayLedger(t.db, events)).toEqual({
      "account.deleted": 1,
      "connection.revoked": 1,
      "shareLink.revoked": 1,
      "shareGrant.ended": 1,
      "trash.purged": 1,
      "admission.revoked": 1,
      "passkey.removed": 2,
    });

    const state = async () => ({
      link: (await t.db.select().from(shareLinks))[0]?.revokedAt instanceof Date,
      grant: (await t.db.select().from(shareGrants))[0]?.status,
      containers: (await t.db.select().from(containers)).map((container) => container.name),
      units: (await t.db.select().from(trashUnits)).length,
      consents: (await t.db.select().from(oauthConsents)).length,
      invitation: (await t.db.select().from(admissionInvitations))[0]?.status,
      cleosAlbums: (await t.db.select().from(albums).where(eq(albums.ownerId, cleo))).length,
      cleo: (await t.db.select().from(users).where(eq(users.id, cleo))).length,
      passkeys: (await t.db.select().from(passkeys)).map((row) => row.id),
    });
    const after = await state();
    expect(after).toMatchObject({
      link: true,
      grant: "revoked",
      containers: ["Kept"],
      units: 0,
      consents: 0,
      invitation: "revoked",
      cleosAlbums: 0,
      cleo: 0,
      passkeys: [keptPasskey],
    });
    await replayLedger(t.db, events);
    expect(await state()).toEqual(after);
  });
});
