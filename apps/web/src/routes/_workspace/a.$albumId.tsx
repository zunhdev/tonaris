// An album's own page (DS-32): `/a/{albumId}`. Inside the app, albums open in the inspector instead.

import { AlbumView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/a/$albumId")({
  component: AlbumPage,
});

function AlbumPage() {
  const { albumId } = Route.useParams();
  return <AlbumView id={albumId} />;
}
