// A Help page (FR-16.1, DS-122, the creator's picks 2A and 4A): the section's name in its color, the title, the
// one-sentence answer, "Needs a computer" where it does, then the page at a reading width. On a wide screen On this
// page sits on the right and marks the section in view. Related pages, then Previous and Next, close it.

import { helpContent } from "@/help/pages.gen";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Monitor } from "lucide-react";
import { createElement, lazy, Suspense, useEffect, useState, type ComponentType } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { HelpFrame } from "./help-frame";
import { helpComponents } from "./mdx-components";
import { helpPage, neighbours, sectionOf, sectionText, type HelpPage } from "./pages";

type Content = ComponentType<{ components: typeof helpComponents }>;

/** Each page's content, loaded once, when it's first shown; the server waits for it, so its page arrives whole. */
const contents = new Map<string, Content>();
function contentOf(page: HelpPage): Content {
  let found = contents.get(page.slug);
  if (!found) {
    found = lazy(helpContent[page.slug]);
    contents.set(page.slug, found);
  }
  return found;
}

/** The id of the section heading in view, for On this page. */
function useSectionInView(ids: readonly string[]): string | undefined {
  const [inView, setInView] = useState<string>();
  useEffect(() => {
    const headings = ids.flatMap((id) => document.getElementById(id) ?? []);
    if (headings.length === 0) return undefined;
    const update = () => {
      // The last heading above the upper third of the window.
      const line = window.innerHeight / 3;
      let found = headings[0]?.id;
      for (const heading of headings)
        if (heading.getBoundingClientRect().top <= line) found = heading.id;
      setInView(found);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [ids]);
  return inView;
}

function OnThisPage({ page }: { page: HelpPage }) {
  const sections = page.headings.filter((heading) => heading.depth === 2);
  const inView = useSectionInView(sections.map((heading) => heading.id));
  if (sections.length < 2) return null;
  return (
    <nav
      aria-label="On this page"
      className="sticky top-24 hidden w-52 shrink-0 self-start xl:block print:hidden"
    >
      <p className="mb-2 text-small font-medium text-fg-primary">On this page</p>
      <ul className="flex flex-col gap-1.5 text-small">
        {sections.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              aria-current={heading.id === inView ? "location" : undefined}
              className={cn(
                "block border-l-2 py-0.5 pl-2.5 hover:text-fg-primary",
                heading.id === inView ? "border-accent-solid text-fg-primary" : "border-subtle",
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PageLink({ page, direction }: { page: HelpPage; direction: "previous" | "next" }) {
  const next = direction === "next";
  return (
    <Link
      to="/help/$"
      params={{ _splat: page.slug }}
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border border-subtle px-4 py-3 focus-ring hover:bg-hover",
        next && "text-right sm:col-start-2",
      )}
    >
      <span className="text-small text-fg-tertiary">{next ? "Next" : "Previous"}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 font-medium text-fg-primary",
          next && "justify-end",
        )}
      >
        {!next && <ArrowLeft aria-hidden strokeWidth={1.5} className="size-4" />}
        {page.title}
        {next && <ArrowRight aria-hidden strokeWidth={1.5} className="size-4" />}
      </span>
    </Link>
  );
}

export function HelpPageView({ page }: { page: HelpPage }) {
  const section = sectionOf(page);
  const { previous, next } = neighbours(page.slug);
  const related = page.related.flatMap((slug) => helpPage(slug) ?? []);
  return (
    <HelpFrame current={page.slug} aside={<OnThisPage page={page} />}>
      <article className="flex max-w-[42.5rem] flex-col gap-5 [&>p]:m-0">
        <header className="flex flex-col gap-3">
          <p className={cn("text-small font-medium", sectionText[section.color])}>
            {section.title}
          </p>
          <h1 className="text-display text-balance text-fg-primary">{page.title}</h1>
          <p className="text-lead text-fg-secondary">{page.summary}</p>
          {page.device === "computer" && (
            <p className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full border border-subtle px-2.5 py-0.5 text-small text-fg-secondary">
              <Monitor aria-hidden strokeWidth={1.5} className="size-3.5" />
              Needs a computer
            </p>
          )}
        </header>
        <Suspense fallback={null}>
          {createElement(contentOf(page), { components: helpComponents })}
        </Suspense>
        {related.length > 0 && (
          <section
            aria-labelledby="related"
            className="mt-6 flex flex-col gap-2.5 border-t border-subtle pt-6 print:hidden"
          >
            <h2
              id="related"
              className="text-small font-medium tracking-[0.06em] text-fg-tertiary uppercase"
            >
              Related
            </h2>
            <ul className="flex flex-col gap-1.5">
              {related.map((other) => (
                <li key={other.slug}>
                  <Link
                    to="/help/$"
                    params={{ _splat: other.slug }}
                    className="text-accent-solid underline decoration-accent-solid/40 underline-offset-3 hover:decoration-accent-solid"
                  >
                    {other.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(previous ?? next) && (
          <nav
            aria-label="Previous and next"
            className="mt-2 grid gap-3 sm:grid-cols-2 print:hidden"
          >
            {previous && <PageLink page={previous} direction="previous" />}
            {next && <PageLink page={next} direction="next" />}
          </nav>
        )}
      </article>
    </HelpFrame>
  );
}
