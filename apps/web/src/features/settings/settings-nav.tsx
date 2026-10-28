// The Settings subnav (DS-92): the settings pages built so far, in DS-92's order, with the current one marked for
// assistive technology too. Profile, Account and Data join with their issues (M8, M10).

import { Link } from "@tanstack/react-router";

const pages = [
  { to: "/settings/preferences", label: "Preferences" },
  { to: "/settings/custom-fields", label: "Custom fields" },
  { to: "/settings/connections", label: "Connections" },
] as const;

export function SettingsNav() {
  return (
    <nav aria-label="Settings" className="flex shrink-0 gap-4 border-b border-subtle px-6">
      {pages.map((page) => (
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
