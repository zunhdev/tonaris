// Emailing sharing invitations (FR-07.5, TS-72): after `share.invite` or `share.resendInvitation` is saved, the
// recipient's current address gets the invitation, linking to its page, which needs sign-in. Until the job queue
// exists, as with sign-in codes, it goes out after the response; how it went is recorded on the grant: sent, failed,
// or unknown when the send outlasts 30 s.

import { invitationToDeliver, recordInvitationEmail, type Database } from "@tonaris/db";
import type { EmailPort } from "@tonaris/domain";

/** How long a send may take before its outcome counts as unknown (FR-07.5: unconfirmed). */
const sendTimeoutMs = 30_000;

/** The invitation's page, which the email links to (DS-66). */
export const invitationUrl = (webOrigin: string, grantId: string) =>
  `${webOrigin}/invitations/${grantId}`;

export async function deliverInvitation(
  { db, email, webOrigin }: { db: Database; email: EmailPort; webOrigin: string },
  grantId: string,
): Promise<void> {
  const invitation = await invitationToDeliver(db, grantId);
  if (!invitation) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), sendTimeoutMs);
  });
  try {
    const sent = await Promise.race([
      email
        .send("share-invitation", invitation.to, {
          // Sharing needs a display name (TS-34), so there is one.
          ownerName: invitation.ownerName ?? "A Tonaris member",
          containerName: invitation.containerName,
          kind: invitation.kind,
          link: invitationUrl(webOrigin, grantId),
        })
        .then(() => "sent" as const),
      timedOut,
    ]);
    await recordInvitationEmail(db, grantId, sent === "timeout" ? "unknown" : "sent");
  } catch (error) {
    await recordInvitationEmail(db, grantId, "failed");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
