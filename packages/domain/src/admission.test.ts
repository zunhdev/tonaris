import { describe, expect, test } from "bun:test";

import {
  admissionAdminRefusalDetails,
  admissionInvitationSchema,
  admissionInviteSchema,
  invitationStatus,
  type AdmissionInvitation,
} from "./admission";

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

describe("the creator's admin (FR-11.6)", () => {
  test("an invitation reports its status and its email's delivery apart", () => {
    const listed: AdmissionInvitation = {
      id: "01a18700-0000-7000-8000-000000000001",
      email: "anna@example.com",
      status: "available",
      createdAt: "2026-10-29T12:00:00.000Z",
      expiresAt: "2026-11-12T12:00:00.000Z",
      redeemedAt: null,
      emailStatus: "failed",
    };
    expect(admissionInvitationSchema.parse(listed)).toEqual(listed);
    expect(admissionInvitationSchema.safeParse({ ...listed, emailStatus: "bounced" }).success).toBe(
      false,
    );
  });

  test("an address is invited as typed, without the spaces around it", () => {
    expect(admissionInviteSchema.parse({ email: "  Anna@Example.com " })).toEqual({
      email: "Anna@Example.com",
    });
    expect(admissionInviteSchema.safeParse({ email: "   " }).success).toBe(false);
  });

  test("refusals name the address", () => {
    expect(admissionAdminRefusalDetails.registered("anna@example.com")).toBe(
      "anna@example.com already has a Tonaris account.",
    );
    expect(admissionAdminRefusalDetails.invited("anna@example.com")).toBe(
      "anna@example.com already has an invitation. Resend it, or revoke it to invite them again.",
    );
  });
});
