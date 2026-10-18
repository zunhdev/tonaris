// The signed-in workspace (TS-03): client-only. Every route below this pathless layout inherits `ssr: false`,
// so the server sends just the document and the browser renders the shell and loads the collection once.

import { Shell } from "@/features/shell/shell";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace")({
  ssr: false,
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
