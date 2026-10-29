// A folder or list shared with the person (DS-70): view-only, in the workspace shell. `?c=` picks a folder or list
// inside the share, as on guest pages.

import { SharedView } from "@/features/sharing/shared-view";
import { createFileRoute } from "@tanstack/react-router";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_workspace/shared/$containerId")({
  validateSearch: (search: Record<string, unknown>): { c?: string } =>
    typeof search.c === "string" && uuid.test(search.c) ? { c: search.c } : {},
  component: SharedPage,
});

function SharedPage() {
  const { containerId } = Route.useParams();
  const { c } = Route.useSearch();
  return <SharedView key={containerId} rootId={containerId} containerId={c} />;
}
