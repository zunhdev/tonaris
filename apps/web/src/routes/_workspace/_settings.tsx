// The Settings pages (DS-92): a pathless layout, so each keeps its `/settings/…` address, that draws their header and
// the Settings subnav (features/settings/section-frame.tsx). Each page names itself in `staticData.title`.

import { SectionFrame } from "@/features/settings/section-frame";
import { SettingsNav } from "@/features/settings/settings-nav";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <SectionFrame nav={<SettingsNav />}>
      <Outlet />
    </SectionFrame>
  );
}
