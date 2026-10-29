// The Admin tabs (DS-100): Admissions, Members and Operations (TS-115), with the current one marked for assistive
// technology too, as the Settings subnav does.

import { Link } from "@tanstack/react-router";

const pages = [
  { to: "/admin/admissions", label: "Admissions" },
  { to: "/admin/members", label: "Members" },
  { to: "/admin/operations", label: "Operations" },
] as const;

export function AdminNav() {
  return (
    <nav aria-label="Admin" className="flex shrink-0 gap-4 border-b border-subtle px-6">
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
