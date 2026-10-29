// Creator-assisted recovery (FR-11.5, TS-73, AC-39's recovery part) against the real app and a fresh test schema:
// the creator's member list holds no collection data; a recovery changes nothing until the new address confirms
// it; confirming moves the same account, ends its sessions, disconnects AI connections only when asked, and is
// audit-logged; and the help page's support address.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { auditLog, oauthClients, oauthConsents, users } from "@tonaris/db";
import {
  accountSchema,
  emailRecoveryRefusalDetails as refusals,
  memberSchema,
} from "@tonaris/domain";

import { createTestApp, insertUser, type SentEmail } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let creator: string;
let anna: { id: string; cookie: string };

const oldAddress = "anna@old.example";
const newAddress = "anna@new.example";

beforeEach(async () => {
  t = await createTestApp({ env: { SUPPORT_EMAIL: "help@tonaris.example" } });
  await insertUser(t.db, "creator@example.com", { role: "creator" });
  ({ cookie: creator } = await t.signIn("creator@example.com"));
  anna = await t.signIn(oldAddress);
});

afterEach(async () => {
  await t.drop();
});

const problem = async (response: Response) =>
  z.object({ code: z.string(), detail: z.string() }).parse(await response.json());

function recover(
  memberId: string,
  body: Partial<{ newEmail: string; reason: string; disconnectConnections: boolean }> = {},
  cookie = creator,
) {
  return t.call(`/v1/admin/members/${memberId}/recovery`, {
    json: {
      newEmail: newAddress,
      reason: "Lost her old mailbox; we spoke on the phone",
      disconnectConnections: false,
      ...body,
    },
    headers: { cookie },
  });
}

/** The token and code in a recovery email's link to `/recover/:token#code=…`. */
function linkOf(email: SentEmail): { token: string; code: string } {
  if (email.template !== "recovery-verification" || !("link" in email.data)) {
    throw new Error(`Expected a recovery email, got ${email.template}`);
  }
  const url = new URL(email.data.link);
  expect(url.origin).toBe(t.config.webOrigin);
  const token = decodeURIComponent(url.pathname.replace("/recover/", ""));
  const code = new URLSearchParams(url.hash.slice(1)).get("code") ?? "";
  expect("code" in email.data && email.data.code).toBe(code);
  return { token, code };
}

/** Starts recovering Anna to the new address and answers the emailed link's token and code. */
async function started(body: Parameters<typeof recover>[1] = {}) {
  const arrived = t.email.next(body.newEmail ?? newAddress);
  const response = await recover(anna.id, body);
  expect(response.status).toBe(200);
  return linkOf(await arrived);
}

const confirm = (token: string, code: string) =>
  t.call("/auth/recovery/confirm", { json: { token, code } });

async function members() {
  const response = await t.call("/v1/admin/members", { headers: { cookie: creator } });
  return z.object({ members: z.array(memberSchema) }).parse(await response.json());
}

describe("the member list (FR-11.6)", () => {
  test("shows only email, display name and join date, and is the creator's", async () => {
    const { members: listed } = await members();
    expect(listed.map((member) => Object.keys(member).toSorted())).toEqual([
      ["displayName", "email", "id", "joinedAt", "recovery"],
      ["displayName", "email", "id", "joinedAt", "recovery"],
    ]);
    expect(listed.map((member) => member.email)).toEqual(["creator@example.com", oldAddress]);

    for (const [path, method] of [
      ["/v1/admin/members", "GET"],
      [`/v1/admin/members/${anna.id}/recovery`, "DELETE"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const asMember = await t.call(path, { method, headers: { cookie: anna.cookie } });
      expect({ path, status: asMember.status }).toEqual({ path, status: 403 });
    }
    expect((await recover(anna.id, {}, anna.cookie)).status).toBe(403);
  });
});

describe("recovering (FR-11.5)", () => {
  test("nothing changes until the new address confirms; then the same account moves, signed out everywhere", async () => {
    const { token, code } = await started();
    // Waiting: Anna still signs in with the old address, and her row says so.
    expect((await t.call("/v1/me", { headers: { cookie: anna.cookie } })).status).toBe(200);
    expect((await members()).members[1]?.recovery).toMatchObject({ newEmail: newAddress });

    const confirmed = await confirm(token, code);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ email: newAddress });

    expect((await t.call("/v1/me", { headers: { cookie: anna.cookie } })).status).toBe(401);
    const again = await t.signIn(newAddress);
    expect(again.id).toBe(anna.id);
    const me = accountSchema.parse(
      await (await t.call("/v1/me", { headers: { cookie: again.cookie } })).json(),
    );
    expect(me).toMatchObject({ id: anna.id, email: newAddress });
    const noAccount = t.email.next(oldAddress);
    await t.call("/auth/email-otp/send-verification-otp", {
      json: { email: oldAddress, type: "sign-in" },
    });
    expect((await noAccount).template).toBe("sign-in-no-account");

    expect(await t.db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        action: "email.recover",
        subject: anna.id,
        details: {
          from: oldAddress,
          to: newAddress,
          reason: "Lost her old mailbox; we spoke on the phone",
          disconnectedConnections: false,
        },
      }),
    ]);
    expect((await members()).members[1]?.recovery).toBeNull();
    // The link is used up.
    expect((await confirm(token, code)).status).toBe(404);
  });

  test("AI connections end only when the creator asks", async () => {
    const clientId = "client-1";
    await t.db.insert(oauthClients).values({ id: Bun.randomUUIDv7(), clientId, redirectUris: [] });
    await t.db
      .insert(oauthConsents)
      .values({ id: Bun.randomUUIDv7(), clientId, userId: anna.id, scopes: ["collection:read"] });

    const kept = await started();
    await confirm(kept.token, kept.code);
    expect(await t.db.select().from(oauthConsents)).toHaveLength(1);

    const ended = await started({ newEmail: "anna@third.example", disconnectConnections: true });
    await confirm(ended.token, ended.code);
    expect(await t.db.select().from(oauthConsents)).toEqual([]);
  });

  test("refusals at the start: a non-address, the current address, another account's, a blank reason", async () => {
    for (const [body, detail] of [
      [{ newEmail: "not an address" }, refusals.notEmail],
      [{ newEmail: "ANNA@old.example" }, refusals.same],
      [{ newEmail: "creator@example.com" }, refusals.taken],
      [{ reason: "   " }, refusals.noReason],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await recover(anna.id, body);
      expect(response.status).toBe(422);
      // oxlint-disable-next-line no-await-in-loop
      expect((await problem(response)).detail).toBe(detail);
    }
    const missing = await recover(Bun.randomUUIDv7());
    expect(missing.status).toBe(404);
    expect(t.email.sent.filter((email) => email.template === "recovery-verification")).toEqual([]);
  });

  test("refusals at confirmation: a wrong code, cancelled, and taken meanwhile", async () => {
    const first = await started();
    const wrong = first.code === "000000" ? "111111" : "000000";
    const refused = await confirm(first.token, wrong);
    expect((await problem(refused)).detail).toBe(refusals.wrongCode);

    const cancelled = await t.call(`/v1/admin/members/${anna.id}/recovery`, {
      method: "DELETE",
      headers: { cookie: creator },
    });
    expect(cancelled.status).toBe(204);
    const gone = await confirm(first.token, first.code);
    expect(gone.status).toBe(404);
    expect((await problem(gone)).detail).toBe(refusals.invalid);

    const second = await started();
    await insertUser(t.db, newAddress);
    const taken = await confirm(second.token, second.code);
    expect((await problem(taken)).detail).toBe(refusals.taken);
    const emails = (await t.db.select().from(users)).map((user) => user.email).toSorted();
    expect(emails).toEqual(["anna@new.example", "anna@old.example", "creator@example.com"]);
    expect(await t.db.select().from(auditLog)).toEqual([]);
  });
});

describe("the support address (TS-73)", () => {
  test("is public, from SUPPORT_EMAIL", async () => {
    const response = await t.call("/v1/support");
    expect(await response.json()).toEqual({ email: "help@tonaris.example" });
  });
});
