// A folder or list shared with the person (DS-70): view-only, in the workspace shell, or, for a share they edit on the
// desktop, the collection's own views on the share's client (TON-191). `?c=` picks a folder or list inside the share,
// as on guest pages.

import { PageHeader } from "@/common/page-header";
import { useCollectionData } from "@/features/collection/data";
import { useCollectionPlace } from "@/features/collection/place";
import { ContainerView } from "@/features/collection/views";
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
  const place = useCollectionPlace();
  if (place.kind === "share" && place.rootId === containerId) {
    return <EditableShare key={containerId} id={c ?? containerId} />;
  }
  return <SharedView key={containerId} rootId={containerId} containerId={c} />;
}

/** The share's folder or list on view, as the person's own would show, once the share is read. */
function EditableShare({ id }: { id: string }) {
  const { tree, ready } = useCollectionData();
  const container = tree.byId.get(id);
  if (!container && !ready) return <PageHeader title="Shared with me" />;
  return <ContainerView id={id} kind={container?.kind ?? "list"} />;
}
