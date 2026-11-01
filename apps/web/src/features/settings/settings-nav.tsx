// The Settings subnav (DS-92): the settings pages built so far, in DS-92's order, with the current one marked for
// assistive technology too. Profile has the display name (TON-76); Account the sign-in email (TON-77); Data the
// usage meter (TON-60). A phone leaves out Custom fields, set up on the desktop (DS-110), and the row scrolls sideways.

import { useNarrowScreen } from "@/features/shell/media";
import { Link } from "@tanstack/react-router";

const pages = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/account", label: "Account" },
  { to: "/settings/preferences", label: "Preferences" },
  { to: "/settings/custom-fields", label: "Custom fields" },
  { to: "/settings/connections", label: "Connections" },
  { to: "/settings/data", label: "Data" },
] as const;

/** Custom fields are set up on the desktop (DS-110). */
const desktopOnly = new Set<string>(["/settings/custom-fields"]);

export function SettingsNav() {
  const narrow = useNarrowScreen();
  return (
    <nav
      data-page-chrome
      aria-label="Settings"
      className="flex shrink-0 gap-4 overflow-x-auto border-b border-subtle px-6"
    >
      {pages
        .filter((page) => !narrow || !desktopOnly.has(page.to))
        .map((page) => (
          <Link
            key={page.to}
            to={page.to}
            className="-mb-px flex h-9 items-center border-b-2 border-transparent text-fg-secondary outline-none hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid aria-[current=page]:border-accent-solid aria-[current=page]:text-fg-primary"
          >
            {page.label}
          </Link>
        ))}
    </nav>
  );
}
