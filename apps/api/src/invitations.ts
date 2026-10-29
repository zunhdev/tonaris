// Emailing sharing invitations (FR-07.5, TS-72): after `share.invite` or `share.resendInvitation` is saved, the
// recipient's current address gets the invitation, linking to its page, which needs sign-in. The email is queued
// (TS-90), and its job records on the grant how it went: sent, failed, or unknown when it couldn't be confirmed.

import { invitationToDeliver, type Database } from "@tonaris/db";
import type { EmailPort } from "@tonaris/domain";

/** The invitation's page, which the email links to (DS-66). */
export const invitationUrl = (webOrigin: string, grantId: string) =>
  `${webOrigin}/invitations/${grantId}`;

export async function deliverInvitation(
  { db, email, webOrigin }: { db: Database; email: EmailPort; webOrigin: string },
  grantId: string,
): Promise<void> {
  const invitation = await invitationToDeliver(db, grantId);
  if (!invitation) return;
  await email.send(
    "share-invitation",
    invitation.to,
    {
      // Sharing needs a display name (TS-34), so there is one.
      ownerName: invitation.ownerName ?? "A Tonaris member",
      containerName: invitation.containerName,
      kind: invitation.kind,
      link: invitationUrl(webOrigin, grantId),
    },
    { outcome: { kind: "share_grant", id: grantId } },
  );
}
