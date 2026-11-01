// A folder or list shared with the person (DS-70): view-only, in the workspace shell. `?c=` picks a folder or list
// inside the share, as on guest pages.

import { SharedView } from "@/features/sharing/shared-view";
import { uuidSearch } from "@/search";
import { createFileRoute } from "@tanstack/react-router";

// `?c=`, the folder or list inside the share; anything but an ID is dropped.
// Made outside the route's options: inferred inside them, beside the functions there, its key's type is lost.
const containerSearch = uuidSearch("c");

export const Route = createFileRoute("/_workspace/shared/$containerId")({
  validateSearch: containerSearch,
  component: SharedPage,
});

function SharedPage() {
  const { containerId } = Route.useParams();
  const { c } = Route.useSearch();
  return <SharedView key={containerId} rootId={containerId} containerId={c} />;
}
