// A list (DS-32): `/l/{listId}`. A folder's ID leads to its own path.

import { ContainerView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/l/$listId")({
  component: List,
});

function List() {
  const { listId } = Route.useParams();
  return <ContainerView id={listId} kind="list" />;
}
