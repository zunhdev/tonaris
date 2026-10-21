import { describe, expect, test } from "bun:test";

import { invitationStatus } from "./admission";

describe("invitation status (TS-71)", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const later = new Date("2026-11-04T12:00:00Z");

  test("an available invitation expires at its expiry, before the daily job records it", () => {
    expect(invitationStatus({ status: "available", expiresAt: later }, now)).toBe("available");
    expect(invitationStatus({ status: "available", expiresAt: now }, now)).toBe("expired");
  });

  test("a used or revoked invitation keeps its status after its expiry", () => {
    expect(invitationStatus({ status: "redeemed", expiresAt: now }, later)).toBe("redeemed");
    expect(invitationStatus({ status: "revoked", expiresAt: now }, later)).toBe("revoked");
  });
});
