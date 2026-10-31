// Agreeing to the terms of use and privacy notice (TON-131): `GET /v1/me` says whether the person agreed to the
// current version, `POST /v1/me/terms` records it, and capture reads YouTube's API only for those who did.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { agreedToTerms } from "@tonaris/db";
import { accountSchema, termsVersion } from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let anna: { id: string; cookie: string };

beforeEach(async () => {
  t = await createTestApp();
  anna = await t.signIn("anna@example.com");
});

afterEach(async () => {
  await t.drop();
});

const me = async (cookie: string) =>
  accountSchema.parse(await (await t.call("/v1/me", { headers: { cookie } })).json());

const agree = (cookie: string, version: string) =>
  t.call("/v1/me/terms", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ version }),
  });

describe("agreeing to the terms", () => {
  test("an account from before the terms hasn't agreed, until it agrees to the current version", async () => {
    expect((await me(anna.cookie)).termsAgreed).toBe(false);
    expect(await agreedToTerms(t.db, anna.id, termsVersion)).toBe(false);

    const agreed = await agree(anna.cookie, termsVersion);
    expect(agreed.status).toBe(200);
    expect(await agreed.json()).toMatchObject({ id: anna.id, termsAgreed: true });
    expect((await me(anna.cookie)).termsAgreed).toBe(true);
    expect(await agreedToTerms(t.db, anna.id, termsVersion)).toBe(true);
  });

  test("an older version is refused, and records nothing", async () => {
    const stale = await agree(anna.cookie, "2020-01-01");
    expect(stale.status).toBe(422);
    expect(await stale.json()).toMatchObject({ code: "validation_failed" });
    expect((await me(anna.cookie)).termsAgreed).toBe(false);
  });

  test("signed out, nothing is recorded", async () => {
    const response = await t.call("/v1/me/terms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: termsVersion }),
    });
    expect(response.status).toBe(401);
  });
});
