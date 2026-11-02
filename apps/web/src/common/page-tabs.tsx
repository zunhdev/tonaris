// A section's tabs under its header (DS-92, DS-100): Settings' or Admin's pages as links, the current one marked for
// assistive technology too, in a row that scrolls sideways when it must (DS-110).

import { Link, type LinkProps } from "@tanstack/react-router";

export type PageTab = { to: NonNullable<LinkProps["to"]>; label: string };

export function PageTabs({ label, pages }: { label: string; pages: readonly PageTab[] }) {
  return (
    <nav
      data-page-chrome
      aria-label={label}
      className="flex shrink-0 gap-4 overflow-x-auto border-b border-subtle px-6"
    >
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
