// Help's search (FR-16.4, DS-122, the creator's picks 3A and 5C): a palette over the page, opened from the header,
// from the home's search field, or with ⌘K or /, anywhere in Help. On a phone it fills the screen, with Cancel.
// - Empty, it offers the pages people look for most, and the reader's last few searches on this device.
// - Each keystroke searches every section of every page (engine.ts), loaded when the palette first opens. Results
//   come grouped by page, best first, each section with its heading and a snippet with the matching words marked.
//   Above them it says when it read a typo as a word ("Showing results for") and which of Tonaris's words it looked
//   for too ("Also looked for").
// - Finding nothing, it says so, and offers Questions and answers and Get in touch (TON-321). A word Help doesn't use
//   may get a spelling offered that finds something ("Did you mean"), first in the list.
// - ↑ ↓ move, Enter opens, ⌘K or Esc closes. A result opens its page at its section, marking the words searched for
//   (arrival.tsx). "All results on a page" opens /help/search.
// The field is a combobox over a listbox (DS-115), as the app's own search is.

// The combobox pattern's listbox, groups and options are plain elements with ARIA roles: an option holds a heading
// and a snippet, which a native `select`'s options can't. Keys reach the options through the field, which names the
// active one (`aria-activedescendant`); a click chooses one.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events */

import type { HelpSlug } from "@/help/pages.gen";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Clock, FileText, Hash, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { CommandDialog, CommandDialogContent } from "@tonaris/ui/components/command";
import { cn } from "@tonaris/ui/lib/utils";

import { Keys } from "../keys";
import { helpPage, sectionDot, sectionOf } from "../pages";
import type { HelpSearchAnswer } from "./engine";
import { useHelpSearch } from "./load";
import { addRecentSearch, recentSearches } from "./recent";
import { Snippet } from "./snippet";

/** The pages people look for most, offered before anything is typed. */
export const oftenAsked: readonly HelpSlug[] = [
  "add-albums/paste-links",
  "share/ways-to-share",
  "trash/remove-delete-undo",
  "agents/connect",
  "add-albums/where-details-come-from",
];

type Option =
  | { kind: "page"; slug: HelpSlug }
  | { kind: "recent"; text: string }
  | { kind: "hit"; slug: string; anchor: string }
  | { kind: "query"; text: string };

type Group = {
  id: string;
  /** What the group is called, as its header shows it. */
  header: ReactNode;
  options: { option: Option; key: string; body: ReactNode }[];
};

/** `groups` with each option's place among all of them, for moving between them. */
function numbered(groups: readonly Group[]) {
  let index = 0;
  return groups.map((group) => ({
    ...group,
    options: group.options.map((each) => {
      index += 1;
      return { ...each, index: index - 1 };
    }),
  }));
}

const groupHeader = "flex items-center gap-2 px-2.5 pt-2 pb-1 text-small";

function PageGroupHeader({ slug, page }: { slug: string; page: string }) {
  const meta = helpPage(slug);
  const section = meta && sectionOf(meta);
  return (
    <>
      {section && (
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-[2px]", sectionDot[section.color])}
        />
      )}
      <span className="font-semibold text-fg-primary">{page}</span>
      {section && <span className="text-fg-tertiary">{section.title}</span>}
    </>
  );
}

/** Where else to look when nothing matches, as the results page offers (TON-321). */
const elsewhere: readonly HelpSlug[] = ["help/questions", "help/get-in-touch"];

/** Pages as options, each by its title. */
function pageOptions(slugs: readonly HelpSlug[]): Group["options"] {
  return slugs.flatMap((slug) => {
    const page = helpPage(slug);
    if (!page) return [];
    return [
      {
        option: { kind: "page", slug },
        key: slug,
        body: (
          <>
            <FileText
              aria-hidden
              strokeWidth={1.5}
              className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
            />
            <span className="text-fg-primary">{page.title}</span>
          </>
        ),
      },
    ];
  });
}

/** The palette's groups: before anything is typed, or for an answer. */
function groupsOf(answer: HelpSearchAnswer | undefined, recent: readonly string[]): Group[] {
  if (!answer) {
    const often: Group = {
      id: "often",
      header: <span className="font-medium text-fg-tertiary">Often asked</span>,
      options: pageOptions(oftenAsked),
    };
    const lately: Group = {
      id: "recent",
      header: <span className="font-medium text-fg-tertiary">Your recent searches</span>,
      options: recent.map((text) => ({
        option: { kind: "recent", text },
        key: text,
        body: (
          <>
            <Clock
              aria-hidden
              strokeWidth={1.5}
              className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
            />
            <span className="text-fg-secondary">{text}</span>
          </>
        ),
      })),
    };
    return [often, lately].filter((group) => group.options.length > 0);
  }
  const guess = answer.didYouMean;
  const offered: Group[] =
    guess === undefined
      ? []
      : [
          {
            id: "guess",
            header: <span className="font-medium text-fg-tertiary">Did you mean</span>,
            options: [
              {
                option: { kind: "query", text: guess },
                key: guess,
                body: (
                  <>
                    <Search
                      aria-hidden
                      strokeWidth={1.5}
                      className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
                    />
                    <span className="text-fg-primary">{guess}</span>
                  </>
                ),
              },
            ],
          },
        ];
  if (answer.results.length === 0) {
    return [
      ...offered,
      {
        id: "elsewhere",
        header: <span className="font-medium text-fg-tertiary">Or try</span>,
        options: pageOptions(elsewhere),
      },
    ];
  }
  return [
    ...offered,
    ...answer.results.map((result): Group => ({
      id: result.slug,
      header: <PageGroupHeader slug={result.slug} page={result.page} />,
      options: result.hits.map((hit) => ({
        option: { kind: "hit", slug: result.slug, anchor: hit.anchor },
        key: hit.id,
        body: (
          <>
            <Hash
              aria-hidden
              strokeWidth={1.5}
              className="mt-1 size-3.5 shrink-0 text-fg-tertiary"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-fg-primary">{hit.heading || result.page}</span>
              {hit.snippet.length > 0 && (
                <span className="line-clamp-2 text-small text-fg-secondary">
                  <Snippet parts={hit.snippet} />
                </span>
              )}
            </span>
          </>
        ),
      })),
    })),
  ];
}

export function HelpSearchDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the field starts with: what was typed into the home's field. */
  initial: string;
}) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogContent label="Search Help" initialFocus={field}>
        <SearchBody field={field} initial={initial} close={() => onOpenChange(false)} />
      </CommandDialogContent>
    </CommandDialog>
  );
}

function SearchBody({
  field,
  initial,
  close,
}: {
  field: RefObject<HTMLInputElement | null>;
  initial: string;
  close: () => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const search = useHelpSearch();
  const [query, setQuery] = useState(initial);
  const [active, setActive] = useState(0);
  const [recent] = useState(recentSearches);
  const text = query.trim();
  const answer = useMemo(() => (search && text ? search.search(text) : undefined), [search, text]);
  const groups = useMemo(
    () => numbered(text && !answer ? [] : groupsOf(answer, recent)),
    [text, answer, recent],
  );
  const options = groups.flatMap((group) => group.options.map(({ option }) => option));
  const at = Math.min(active, options.length - 1);
  const current = options[at];
  const optionId = (index: number) => `${id}-option-${index}`;
  const listboxId = `${id}-results`;

  useEffect(() => {
    document.getElementById(`${id}-option-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [id, at]);

  const allResults = () => {
    addRecentSearch(text);
    close();
    void navigate({ to: "/help/search", search: { q: text } });
  };

  const choose = (option: Option) => {
    if (option.kind === "recent" || option.kind === "query") {
      setQuery(option.text);
      setActive(0);
      field.current?.focus();
      return;
    }
    close();
    if (option.kind === "page") {
      void navigate({ to: "/help/$", params: { _splat: option.slug } });
      return;
    }
    addRecentSearch(text);
    void navigate({
      to: "/help/$",
      params: { _splat: option.slug },
      search: { hl: answer?.showingFor ?? text },
      hash: option.anchor || undefined,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && options.length > 0) {
      event.preventDefault();
      setActive((Math.max(at, 0) + step + options.length) % options.length);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (current) choose(current);
      // Before the search has loaded, or with nothing found, Enter opens the results page.
      else if (text) allResults();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      // ⌘K again closes it.
      event.preventDefault();
      close();
    }
  };

  const found = answer?.results.reduce((sum, result) => sum + result.hits.length, 0) ?? 0;
  const notices = [
    ...(answer?.showingFor === undefined ? [] : [`Showing results for “${answer.showingFor}”.`]),
    ...(answer && answer.alsoLookedFor.length > 0
      ? [`Also looked for: ${answer.alsoLookedFor.join(", ")}.`]
      : []),
  ];

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-subtle px-4">
        <Search aria-hidden strokeWidth={1.5} className="size-4.5 shrink-0 text-fg-tertiary" />
        <input
          ref={field}
          role="combobox"
          aria-label="Search Help"
          aria-expanded={options.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(at) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search Help"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onFocus={(event) => {
            // The caret goes after what was typed on the home's field.
            const end = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(end, end);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-[1rem] text-fg-primary outline-none placeholder:text-fg-tertiary"
        />
        <kbd className="rounded-sm border border-subtle bg-raised px-1.5 font-sans text-small text-fg-secondary max-md:hidden">
          esc
        </kbd>
        <button
          type="button"
          className="-mr-1 h-11 rounded-md px-1.5 text-[1rem] text-accent-solid focus-ring md:hidden"
          onClick={close}
        >
          Cancel
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2 max-md:flex-1">
        {notices.map((notice) => (
          <p
            key={notice}
            className="mx-0.5 mb-1.5 rounded-md bg-accent-soft px-2.5 py-2 text-small text-fg-secondary"
          >
            {notice}
          </p>
        ))}
        {text && !answer && <p className="px-2.5 py-6 text-center text-fg-tertiary">Searching…</p>}
        {answer && answer.results.length === 0 && (
          <p className="px-2.5 pt-5 pb-3 text-center text-fg-tertiary">{`Nothing matches “${text}”.`}</p>
        )}
        <div
          id={listboxId}
          role="listbox"
          aria-label={answer ? "Results" : "Suggestions"}
          className={cn("flex flex-col gap-1.5", options.length === 0 && "hidden")}
        >
          {groups.map((group) => (
            <div
              key={group.id}
              role="group"
              aria-labelledby={`${id}-${group.id}`}
              className="flex flex-col gap-0.5"
            >
              <div id={`${id}-${group.id}`} className={groupHeader}>
                {group.header}
              </div>
              {group.options.map(({ option, key, body, index: mine }) => {
                return (
                  <div
                    key={key}
                    id={optionId(mine)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={mine === at}
                    // The field keeps the focus.
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerMove={() => setActive(mine)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex cursor-default gap-2.5 rounded-md px-2.5 py-2 text-base",
                      mine === at && "bg-hover",
                    )}
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex h-10 shrink-0 items-center gap-3.5 border-t border-subtle px-4 text-small text-fg-tertiary max-md:hidden">
        <span className="inline-flex items-center gap-1.5">
          <Keys k="↑" />
          <Keys k="↓" />
          Move
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Keys k="Enter" />
          Open
        </span>
        <span className="flex-1" />
        {found > 0 && (
          <Link
            to="/help/search"
            search={{ q: text }}
            onClick={() => {
              addRecentSearch(text);
              close();
            }}
            className="inline-flex items-center gap-1 rounded-sm text-fg-secondary focus-ring hover:text-fg-primary"
          >
            All results on a page
            <ArrowRight aria-hidden strokeWidth={1.5} className="size-3.5" />
          </Link>
        )}
      </div>
      <output className="sr-only">
        {answer
          ? found === 0
            ? "No results"
            : `${found} ${found === 1 ? "result" : "results"}`
          : ""}
      </output>
    </>
  );
}
