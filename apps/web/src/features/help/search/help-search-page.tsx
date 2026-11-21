// Help's results page (FR-16.4, DS-122, the creator's pick 3C): /help/search?q=, rendered on the server, so a search
// can be linked to and works before the page's scripts run. Every section found, each under its section of Help and
// page, with its heading and a snippet. Above them, any typo read as a word, Tonaris's words looked for too, and a
// spelling offered for a word Help doesn't use. Finding nothing, it says so, and offers other ways to an answer.

import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useId, type FormEvent } from "react";

import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

import { HelpFrame } from "../help-frame";
import { helpPage, sectionDot, sectionOf } from "../pages";
import type { HelpSearchAnswer } from "./engine";
import { addRecentSearch } from "./recent";
import { Snippet } from "./snippet";

const linkClass =
  "text-accent-solid underline decoration-accent-solid/40 underline-offset-3 hover:decoration-accent-solid";

function SearchForm({ query }: { query: string }) {
  const id = useId();
  const navigate = useNavigate();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q");
    if (typeof q !== "string" || q.trim() === "") return;
    addRecentSearch(q);
    void navigate({ to: "/help/search", search: { q: q.trim() } });
  };
  return (
    <search>
      <form action="/help/search" method="get" onSubmit={onSubmit} className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Search Help
        </label>
        <span className="relative flex-1">
          <Search
            aria-hidden
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-fg-tertiary"
          />
          <input
            key={query}
            id={id}
            name="q"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            defaultValue={query}
            placeholder="Search Help"
            className="h-12 w-full rounded-lg border border-subtle bg-field pr-4 pl-11 text-[1rem] text-fg-primary focus-ring transition-colors duration-100 outline-none placeholder:text-fg-tertiary hover:border-strong"
          />
        </span>
        <Button type="submit" className="h-12 px-4.5">
          Search
        </Button>
      </form>
    </search>
  );
}

function DidYouMean({ guess }: { guess: string }) {
  return (
    <p>
      Did you mean{" "}
      <Link to="/help/search" search={{ q: guess }} className={cn(linkClass, "font-semibold")}>
        {guess}
      </Link>
      ?
    </p>
  );
}

function NothingFound({ query, guess }: { query: string; guess: string | undefined }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-fg-primary">{`Nothing matches “${query}”`}</h1>
      {guess !== undefined && <DidYouMean guess={guess} />}
      <div className="flex flex-col gap-2 border-t border-subtle pt-4 text-base">
        <p className="text-fg-tertiary">Or try</p>
        <Link
          to="/help/$"
          params={{ _splat: "help/questions" }}
          className="self-start text-fg-primary hover:underline"
        >
          Questions and answers{" "}
          <ArrowRight aria-hidden strokeWidth={1.5} className="inline size-3.5" />
        </Link>
        <Link to="/help" className="self-start text-fg-primary hover:underline">
          All of Help, by topic{" "}
          <ArrowRight aria-hidden strokeWidth={1.5} className="inline size-3.5" />
        </Link>
        <Link
          to="/help/$"
          params={{ _splat: "help/get-in-touch" }}
          className="self-start text-fg-primary hover:underline"
        >
          Ask on the feedback board{" "}
          <ArrowRight aria-hidden strokeWidth={1.5} className="inline size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Results({ query, answer }: { query: string; answer: HelpSearchAnswer }) {
  const searched = answer.showingFor ?? query;
  const hits = answer.results.flatMap((result) => result.hits.map((hit) => ({ result, hit })));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-fg-primary">
          {`${hits.length} ${hits.length === 1 ? "result" : "results"} for “${query}”`}
        </h1>
        {answer.showingFor !== undefined && (
          <p className="text-base text-fg-tertiary">Showing results for “{answer.showingFor}”.</p>
        )}
        {answer.alsoLookedFor.length > 0 && (
          <p className="text-base text-fg-tertiary">
            Also looked for: {answer.alsoLookedFor.join(", ")}.
          </p>
        )}
      </div>
      {answer.didYouMean !== undefined && <DidYouMean guess={answer.didYouMean} />}
      <ol className="flex flex-col">
        {hits.map(({ result, hit }) => {
          const page = helpPage(result.slug);
          const section = page && sectionOf(page);
          return (
            <li key={hit.id} className="flex flex-col gap-1 border-t border-subtle py-4.5">
              <span className="flex items-center gap-1.5 text-small text-fg-tertiary">
                {section && (
                  <span
                    aria-hidden
                    className={cn("size-[7px] shrink-0 rounded-[2px]", sectionDot[section.color])}
                  />
                )}
                {result.section} › {result.page}
              </span>
              <Link
                to="/help/$"
                params={{ _splat: result.slug }}
                search={{ hl: searched }}
                hash={hit.anchor || undefined}
                className="self-start text-lead font-semibold text-fg-primary focus-ring hover:underline"
              >
                {hit.heading || result.page}
              </Link>
              {hit.snippet.length > 0 && (
                <p className="text-fg-secondary">
                  <Snippet parts={hit.snippet} />
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function HelpSearchPage({
  query,
  answer,
}: {
  query: string;
  answer: HelpSearchAnswer | undefined;
}) {
  return (
    <HelpFrame contents={false}>
      <div className="mx-auto flex max-w-[45rem] flex-col gap-8">
        <SearchForm query={query} />
        {answer === undefined ? (
          <h1 className="text-title text-fg-primary">Search Help</h1>
        ) : answer.results.length === 0 ? (
          <NothingFound query={query} guess={answer.didYouMean} />
        ) : (
          <Results query={query} answer={answer} />
        )}
      </div>
    </HelpFrame>
  );
}
