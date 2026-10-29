// Invitations (DS-32, DS-66): the sharing invitations waiting for the signed-in person.

import { InvitationsView } from "@/features/sharing/invitations";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/invitations/")({
  head: () => ({ meta: [{ title: "Invitations · Tonaris" }] }),
  component: InvitationsView,
});
