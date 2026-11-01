// The Admin pages (DS-100, TS-115): a pathless layout, so each keeps its `/admin/…` address, for the creator only;
// anyone else finds no page there. It draws their header and the Admin tabs (features/settings/section-frame.tsx), and
// on a phone says Admin is on the desktop instead of the page. Each page names itself in `staticData.title`.

import { AdminNav } from "@/features/admin/admin-nav";
import { useNarrowScreen } from "@/features/collection/collection-ui";
import { SectionFrame } from "@/features/settings/section-frame";
import { DesktopOnly } from "@/features/shell/desktop-only";
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_admin")({
  beforeLoad: ({ context }) => {
    if (context.account.role !== "creator") throw notFound();
  },
  component: AdminLayout,
});

function AdminLayout() {
  const narrow = useNarrowScreen();
  return (
    <SectionFrame nav={<AdminNav />}>
      {narrow ? <DesktopOnly what="Admin" /> : <Outlet />}
    </SectionFrame>
  );
}
