// Help's contents (DS-122, the creator's pick 2A): every section that has pages, the current one open, in the
// sidebar on a computer and in a sheet on a phone. Each section opens and closes like a disclosure. The keyboard
// moves through it as through the app's tree (FR-16.2): ↑ and ↓ between rows, → opens a section, ← closes it or
// goes up to it, Home and End to the first and last rows; Tab leaves it.

import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { sectionDot, sectionsWithPages } from "./pages";

const rowClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base text-fg-secondary hover:bg-hover hover:text-fg-primary focus-ring-inset";

/** The rows in the contents, in the order they show. */
const rowsOf = (nav: HTMLElement) => [...nav.querySelectorAll<HTMLElement>("[data-help-row]")];

function onKeyDown(event: KeyboardEvent<HTMLElement>) {
  const nav = event.currentTarget;
  const rows = rowsOf(nav);
  const at = rows.findIndex((each) => each === document.activeElement);
  if (at === -1) return;
  const row = rows[at];
  const focus = (index: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  switch (event.key) {
    case "ArrowDown":
      return focus(at + 1);
    case "ArrowUp":
      return focus(at - 1);
    case "Home":
      return focus(0);
    case "End":
      return focus(rows.length - 1);
    case "ArrowRight":
      if (row?.getAttribute("aria-expanded") === "false") {
        event.preventDefault();
        row.click();
      } else if (row?.getAttribute("aria-expanded") === "true") focus(at + 1);
      return;
    case "ArrowLeft": {
      if (row?.getAttribute("aria-expanded") === "true") {
        event.preventDefault();
        row.click();
        return;
      }
      // From a page, up to its section.
      const section = row
        ?.closest("[data-help-section]")
        ?.querySelector<HTMLElement>("[aria-expanded]");
      if (section && section !== row) {
        event.preventDefault();
        section.focus();
      }
      return;
    }
    default:
  }
}

export function HelpNav({ current, onNavigate }: { current?: string; onNavigate?: () => void }) {
  const sections = sectionsWithPages();
  const currentSection = sections.find(({ pages }) => pages.some((page) => page.slug === current));
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(currentSection ? [currentSection.section.id] : []),
  );
  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    // The keys move between the contents' rows, as in a tree (FR-16.2).
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <nav aria-label="Help" onKeyDown={onKeyDown}>
      <ul className="flex flex-col gap-0.5">
        <li>
          <Link
            to="/help"
            data-help-row
            className={rowClass}
            activeOptions={{ exact: true }}
            activeProps={{ "aria-current": "page", className: "bg-selected text-fg-primary" }}
            onClick={onNavigate}
          >
            Help home
          </Link>
        </li>
        {sections.map(({ section, pages }) => {
          const expanded = open.has(section.id);
          return (
            <li key={section.id} data-help-section>
              <button
                type="button"
                data-help-row
                aria-expanded={expanded}
                className={cn(rowClass, expanded && "text-fg-primary")}
                onClick={() => toggle(section.id)}
              >
                <ChevronRight
                  aria-hidden
                  strokeWidth={1.5}
                  className={cn(
                    "size-3.5 shrink-0 text-fg-tertiary transition-transform",
                    expanded && "rotate-90",
                  )}
                />
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-[2px]", sectionDot[section.color])}
                />
                {section.title}
              </button>
              {expanded && (
                <ul className="mt-0.5 mb-1.5 ml-[15px] flex flex-col gap-0.5 border-l border-subtle pl-2">
                  {pages.map((page) => (
                    <li key={page.slug}>
                      <Link
                        to="/help/$"
                        params={{ _splat: page.slug }}
                        data-help-row
                        aria-current={page.slug === current ? "page" : undefined}
                        className={cn(
                          rowClass,
                          page.slug === current && "bg-selected text-fg-primary",
                        )}
                        onClick={onNavigate}
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
