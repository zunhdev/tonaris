// Settings → Preferences (DS-94, FR-11.7, FR-11.8): the account defaults every view follows where its person made no
// choice of its own, where links open, and the streaming services the person uses (features/settings/preferences.tsx).

import { PreferencesSettings } from "@/features/settings/preferences";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_settings/settings/preferences")({
  staticData: { title: "Preferences" },
  head: () => ({ meta: [{ title: "Preferences · Tonaris" }] }),
  component: PreferencesSettings,
});
