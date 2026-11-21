// Help's home (DS-122, the creator's pick 1A): what Help is for, then "New here?" with the first two pages, then
// every section as a tile with its pages. Search joins the top in TON-314.

import type { HelpSlug } from "@/help/pages.gen";
import type { HelpIcon } from "@/help/sections";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CirclePlus,
  Clock,
  Folder,
  Keyboard,
  LayoutGrid,
  LifeBuoy,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { HelpFrame } from "./help-frame";
import { helpPage, sectionsWithPages, sectionText, type HelpPage } from "./pages";

export const sectionIcons: Record<HelpIcon, LucideIcon> = {
  book: BookOpen,
  add: CirclePlus,
  folder: Folder,
  grid: LayoutGrid,
  tag: Tag,
  users: Users,
  trash: Trash2,
  sparkles: Sparkles,
  phone: Smartphone,
  user: UserRound,
  sync: RefreshCw,
  keyboard: Keyboard,
  buoy: LifeBuoy,
};

const eyebrow = "text-small font-medium tracking-[0.06em] text-fg-tertiary uppercase";
const pageLink = "text-fg-secondary hover:text-fg-primary hover:underline underline-offset-3";

/** The two pages for someone new, with what each gives them. */
const newHere: { slug: HelpSlug; icon: LucideIcon; line: string }[] = [
  {
    slug: "start-here/what-tonaris-is",
    icon: BookOpen,
    line: "Albums, lists, folders and Unsorted: the ideas everything else builds on.",
  },
  {
    slug: "start-here/your-first-ten-minutes",
    icon: Clock,
    line: "Make a list, add an album from a link, and play it where you listen.",
  },
];

function Tile({
  title,
  color,
  icon,
  pages,
}: {
  title: string;
  color: keyof typeof sectionText;
  icon: HelpIcon;
  pages: HelpPage[];
}) {
  const [all, setAll] = useState(false);
  const Icon = sectionIcons[icon];
  const shown = all ? pages : pages.slice(0, 3);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-subtle bg-panel p-5">
      <h3 className="flex items-center gap-3 text-title text-fg-primary">
        <span className="flex size-8 items-center justify-center rounded-md bg-raised">
          <Icon aria-hidden strokeWidth={1.5} className={cn("size-4", sectionText[color])} />
        </span>
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5 text-base">
        {shown.map((page) => (
          <li key={page.slug}>
            <Link to="/help/$" params={{ _splat: page.slug }} className={pageLink}>
              {page.title}
            </Link>
          </li>
        ))}
      </ul>
      {pages.length > 3 && !all && (
        <button
          type="button"
          className="mt-auto self-start rounded-sm text-small text-fg-tertiary focus-ring hover:text-fg-primary"
          onClick={() => setAll(true)}
        >
          {pages.length - 3} more
        </button>
      )}
    </li>
  );
}

export function HelpHome() {
  const sections = sectionsWithPages();
  return (
    <HelpFrame contents={false}>
      <div className="mx-auto flex max-w-[65rem] flex-col gap-14">
        <section className="flex flex-col items-center gap-4 pt-6 text-center md:pt-10">
          <h1 className="text-headline text-fg-primary">Tonaris Help</h1>
          <p className="max-w-xl text-lead text-fg-secondary">
            Short answers to how Tonaris works, from your first album to sharing a whole folder.
          </p>
        </section>

        <section aria-labelledby="new-here" className="flex flex-col gap-4">
          <h2 id="new-here" className={eyebrow}>
            New here?
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {newHere.map(({ slug, icon: Icon, line }) => {
              const page = helpPage(slug);
              if (!page) return null;
              return (
                <li key={slug}>
                  <Link
                    to="/help/$"
                    params={{ _splat: slug }}
                    className="flex h-full gap-4 rounded-lg border border-subtle bg-panel p-5 focus-ring hover:bg-hover"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-solid">
                      <Icon aria-hidden strokeWidth={1.5} className="size-5" />
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="font-semibold text-fg-primary">{page.title}</span>
                      <span className="text-base text-fg-secondary">{line}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="topics" className="flex flex-col gap-4">
          <h2 id="topics" className={eyebrow}>
            Browse by topic
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map(({ section, pages }) => (
              <Tile
                key={section.id}
                title={section.title}
                color={section.color}
                icon={section.icon}
                pages={pages}
              />
            ))}
          </ul>
        </section>
      </div>
    </HelpFrame>
  );
}
