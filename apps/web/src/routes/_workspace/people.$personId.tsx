// A person's page (DS-121, FR-07.24): what's shared each way with one of the person's people.

import { PersonView } from "@/features/sharing/person";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/people/$personId")({
  head: () => ({ meta: [{ title: "People · Tonaris" }] }),
  component: PersonPage,
});

function PersonPage() {
  const { personId } = Route.useParams();
  return <PersonView key={personId} personId={personId} />;
}
