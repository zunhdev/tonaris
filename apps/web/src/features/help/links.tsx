// The app's links into Help (FR-16.5, DS-122, TON-315). A link names a page and, optionally, one of its headings,
// both checked against Help's page list when the app is type-checked: renaming a page or a heading in Help fails
// the check until every link to it follows. Only the types are imported, so the workspace carries none of Help.
// Links from inside the workspace open in a new tab, so people keep their place there.

import type { HelpSlug, helpPages } from "@/help/pages.gen";

import { cn } from "@tonaris/ui/lib/utils";

type PageOf<S extends HelpSlug> = Extract<(typeof helpPages)[number], { slug: S }>;

/** The id of one of the page's headings. */
export type HelpAnchor<S extends HelpSlug> = PageOf<S>["headings"][number]["id"];

/** Help's address: its home, a page, or a heading on a page. */
export function helpAddress<S extends HelpSlug>(page?: S, anchor?: HelpAnchor<S>): string {
  if (page === undefined) return "/help";
  return anchor === undefined ? `/help/${page}` : `/help/${page}#${anchor}`;
}

/** Help's results page for `query`. */
export const helpSearchAddress = (query: string) => `/help/search?q=${encodeURIComponent(query)}`;

/** Opens Help in a new tab. */
export function openHelp<S extends HelpSlug>(page?: S, anchor?: HelpAnchor<S>): void {
  window.open(helpAddress(page, anchor), "_blank", "noopener");
}

/**
 * "Learn more", only where people hesitate (TON-315): the Help section about what's in front of them, in a new tab.
 * A screen reader hears what it's about, and that it opens a new tab.
 */
export function LearnMore<S extends HelpSlug>({
  page,
  anchor,
  about,
  className,
}: {
  page: S;
  anchor?: HelpAnchor<S>;
  /** What it's about, read after "Learn more about". */
  about: string;
  className?: string;
}) {
  return (
    <a
      href={helpAddress(page, anchor)}
      target="_blank"
      rel="noopener"
      className={cn(
        "rounded-sm text-accent-solid underline-offset-3 focus-ring hover:underline",
        className,
      )}
    >
      Learn more<span className="sr-only"> about {about}, in a new tab</span>
    </a>
  );
}
