// The collection root (DS-32). M2 fills it with the owner's folders, lists and albums.

import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/c")({
  component: CollectionRoot,
});

function CollectionRoot() {
  return (
    <>
      <PageHeader title="Collection" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-display text-fg-primary">Your collection is empty</p>
        <p className="text-fg-secondary">Albums, folders and lists you add will appear here.</p>
      </div>
    </>
  );
}
