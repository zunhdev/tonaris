// A folder (DS-32): `/f/{folderId}`. A list's ID leads to its own path.

import { ContainerView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/f/$folderId")({
  component: Folder,
});

function Folder() {
  const { folderId } = Route.useParams();
  return <ContainerView id={folderId} kind="folder" />;
}
