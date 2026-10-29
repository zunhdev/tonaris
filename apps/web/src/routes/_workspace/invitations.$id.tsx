// An invitation (DS-32, DS-66): where its email lands. The workspace asks for sign-in first, and comes back here.

import { InvitationView } from "@/features/sharing/invitations";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/invitations/$id")({
  head: () => ({ meta: [{ title: "Invitation · Tonaris" }] }),
  component: InvitationPage,
});

function InvitationPage() {
  const { id } = Route.useParams();
  return <InvitationView key={id} id={id} />;
}
