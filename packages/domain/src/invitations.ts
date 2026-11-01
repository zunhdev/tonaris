// Invitations from their recipient's side and their email (FR-07.5, FR-07.6; DS-66, TS-33): what an invitation's
// email page shows the person who opens it, and when a send that never reported back stops counting as sending.

import type { EmailStatus, Invitation, InvitationState, ShareGrantStatus } from "./sharing";

/**
 * An invitation as its email's page shows it to `userId` (DS-66): theirs while pending or accepted; someone else's
 * while pending, with nothing about it; otherwise unavailable, as a missing one is, or one whose collection is in
 * Trash.
 */
export function invitationStateFor(
  userId: string,
  grant:
    | { status: ShareGrantStatus; granteeId: string; trashed: boolean; invitation: Invitation }
    | undefined,
): InvitationState {
  if (!grant || grant.trashed) return { state: "unavailable" };
  if (grant.granteeId !== userId) {
    return grant.status === "pending" ? { state: "wrong_account" } : { state: "unavailable" };
  }
  if (grant.status === "pending") return { state: "pending", invitation: grant.invitation };
  if (grant.status === "accepted") return { state: "accepted", invitation: grant.invitation };
  return { state: "unavailable" };
}

/** How long a send may stay unanswered before it reads as unconfirmed (FR-07.5): the server may have stopped. */
const sendingTimeoutMs = 5 * 60_000;

/**
 * An invitation's email status as its owner's dialog shows it (FR-07.5): a `sending` last changed at `updatedAt`
 * more than `sendingTimeoutMs` before `now` never reported back, so it is `unknown`.
 */
export function shownEmailStatus(
  status: EmailStatus | null,
  updatedAt: Date,
  now: Date,
): EmailStatus | null {
  return status === "sending" && updatedAt.getTime() < now.getTime() - sendingTimeoutMs
    ? "unknown"
    : status;
}
