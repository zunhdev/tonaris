// An invitation from its recipient's side (DS-66, FR-07.5): what its page shows each person, in every grant status,
// and when an unanswered send reads as unconfirmed.

import { describe, expect, test } from "bun:test";

import { invitationStateFor, shownEmailStatus } from "./invitations";
import { shareGrantStatuses, type Invitation } from "./sharing";

const invitation: Invitation = {
  id: "0195d0a0-0000-7000-8000-000000000001",
  owner: { displayName: "Denis" },
  container: { id: "0195d0a0-0000-7000-8000-000000000002", name: "Doom", kind: "list" },
  invitedAt: "2026-11-01T12:00:00.000Z",
};

describe("an invitation's page (DS-66)", () => {
  const anna = "anna";
  const grant = (
    status: (typeof shareGrantStatuses)[number],
    granteeId = anna,
    trashed = false,
  ) => ({
    status,
    granteeId,
    trashed,
    invitation,
  });

  test("its recipient sees it while pending or accepted, and nothing after", () => {
    expect(invitationStateFor(anna, grant("pending"))).toEqual({ state: "pending", invitation });
    expect(invitationStateFor(anna, grant("accepted"))).toEqual({ state: "accepted", invitation });
    for (const status of ["declined", "withdrawn", "revoked"] as const) {
      expect(invitationStateFor(anna, grant(status))).toEqual({ state: "unavailable" });
    }
  });

  test("someone else learns only that a pending one is another account's", () => {
    expect(invitationStateFor("ben", grant("pending"))).toEqual({ state: "wrong_account" });
    for (const status of shareGrantStatuses.filter((each) => each !== "pending")) {
      expect(invitationStateFor("ben", grant(status))).toEqual({ state: "unavailable" });
    }
  });

  test("a missing one, or one whose collection is in Trash, is unavailable to anyone", () => {
    expect(invitationStateFor(anna, undefined)).toEqual({ state: "unavailable" });
    expect(invitationStateFor(anna, grant("pending", anna, true))).toEqual({
      state: "unavailable",
    });
    expect(invitationStateFor("ben", grant("pending", anna, true))).toEqual({
      state: "unavailable",
    });
  });
});

describe("an invitation's email status (FR-07.5)", () => {
  const now = new Date(Date.UTC(2026, 10, 1, 12, 0, 0));
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  test("a send unanswered for over 5 minutes reads as unknown; anything else as stored", () => {
    expect(shownEmailStatus("sending", ago(5), now)).toBe("sending");
    expect(shownEmailStatus("sending", ago(5.01), now)).toBe("unknown");
    expect(shownEmailStatus("sent", ago(60), now)).toBe("sent");
    expect(shownEmailStatus("failed", ago(60), now)).toBe("failed");
    expect(shownEmailStatus(null, ago(60), now)).toBeNull();
  });
});
