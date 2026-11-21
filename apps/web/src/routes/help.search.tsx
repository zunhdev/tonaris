// `/help/search?q=` (FR-16.4, DS-122): Help's results page, public and rendered on the server with its results
// (features/help/search). Not for search engines: each search is its own page.

import { HelpSearchPage } from "@/features/help/search/help-search-page";
import { loadHelpSearch } from "@/features/help/search/load";
import { createFileRoute } from "@tanstack/react-router";

/** Longer than any search worth running. */
const maxQuery = 200;

export const Route = createFileRoute("/help/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q.trim() !== ""
      ? { q: search.q.trim().slice(0, maxQuery) }
      : {},
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: async ({ deps: { q } }) => ({
    query: q,
    // The whole answer, not the palette's first few pages.
    answer: q === "" ? undefined : (await loadHelpSearch()).search(q, 20),
  }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.query
          ? `“${loaderData.query}” in Help · Tonaris`
          : "Search Help · Tonaris",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SearchRoute,
});

function SearchRoute() {
  const { query, answer } = Route.useLoaderData();
  return <HelpSearchPage query={query} answer={answer} />;
}
