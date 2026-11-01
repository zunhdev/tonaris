// The Settings subnav (DS-92): the settings pages built so far, in DS-92's order, with the current one marked for
// assistive technology too. Profile has the display name (TON-76); Account the sign-in email (TON-77); Data the
// usage meter (TON-60). A phone leaves out Custom fields, set up on the desktop (DS-110), and the row scrolls sideways.

import { useNarrowScreen } from "@/features/shell/media";
import { PageTabs, type PageTab } from "@/features/shell/page-tabs";

const pages: readonly PageTab[] = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/account", label: "Account" },
  { to: "/settings/preferences", label: "Preferences" },
  { to: "/settings/custom-fields", label: "Custom fields" },
  { to: "/settings/connections", label: "Connections" },
  { to: "/settings/data", label: "Data" },
];

/** Custom fields are set up on the desktop (DS-110). */
const desktopOnly = new Set<string>(["/settings/custom-fields"]);

export function SettingsNav() {
  const narrow = useNarrowScreen();
  return (
    <PageTabs
      label="Settings"
      pages={pages.filter((page) => !narrow || !desktopOnly.has(page.to))}
    />
  );
}
