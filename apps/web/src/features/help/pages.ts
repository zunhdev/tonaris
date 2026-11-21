// Help's pages as the frame uses them (DS-122): by slug, by section, and in reading order for Previous and Next.

import { helpPages, type HelpSlug } from "@/help/pages.gen";
import { helpSections, type HelpColor, type HelpSection } from "@/help/sections";

export type HelpPage = (typeof helpPages)[number];

const bySlug = new Map<string, HelpPage>(helpPages.map((page) => [page.slug, page]));

/** The page at `slug`, if Help has one. */
export function helpPage(slug: string): HelpPage | undefined {
  return bySlug.get(slug);
}

/** The pages of a section, in order. */
export function sectionPages(id: HelpSection["id"]): HelpPage[] {
  return helpPages.filter((page) => page.section === id);
}

/** The sections that have pages, each with them, in the sidebar's order. */
export function sectionsWithPages(): { section: HelpSection; pages: HelpPage[] }[] {
  return helpSections
    .map((section) => ({ section, pages: sectionPages(section.id) }))
    .filter(({ pages }) => pages.length > 0);
}

export function sectionOf(page: HelpPage): HelpSection {
  const found = helpSections.find((section) => section.id === page.section);
  if (!found) throw new Error(`No Help section ${page.section}`);
  return found;
}

/** The pages before and after `slug` in reading order, across sections. */
export function neighbours(slug: string): { previous?: HelpPage; next?: HelpPage } {
  const index = helpPages.findIndex((page) => page.slug === slug);
  return { previous: helpPages[index - 1], next: helpPages[index + 1] };
}

/** A page's address. */
export const helpHref = (slug: HelpSlug) => `/help/${slug}`;

/** A section's color as text, for its icon and its name over a page (the folder colors, DS-27). */
export const sectionText: Record<HelpColor, string> = {
  accent: "text-accent-solid",
  green: "text-folder-green",
  amber: "text-folder-amber",
  teal: "text-folder-teal",
  orange: "text-folder-orange",
  blue: "text-folder-blue",
  red: "text-folder-red",
  violet: "text-folder-violet",
  pink: "text-folder-pink",
  neutral: "text-fg-secondary",
};

/** A section's color as a small square beside its name. */
export const sectionDot: Record<HelpColor, string> = {
  accent: "bg-accent-solid",
  green: "bg-folder-green",
  amber: "bg-folder-amber",
  teal: "bg-folder-teal",
  orange: "bg-folder-orange",
  blue: "bg-folder-blue",
  red: "bg-folder-red",
  violet: "bg-folder-violet",
  pink: "bg-folder-pink",
  neutral: "bg-fg-tertiary",
};
