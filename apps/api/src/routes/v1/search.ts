// Search (FR-12.1, FR-12.4, FR-12.5, X-02; TS-50): the signed-in account's active folders, lists and albums whose
// names, titles or artists contain the query, ignoring case and accents, in the order the app shows them. Each
// group answers its total and its first `limit`, located. Trash and other accounts' content never appear.

import { Elysia } from "elysia";
import { z } from "zod";

import { searchCollection, type Database } from "@tonaris/db";
import {
  defaultSearchLimit,
  maxSearchLimit,
  maxSearchQueryLength,
  problemSchema,
  searchResultsSchema,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";

const searchQuery = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(maxSearchQueryLength)
    .meta({ description: "The text to find, matched as a substring ignoring case and accents." }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(maxSearchLimit)
    .default(defaultSearchLimit)
    .meta({ description: "At most this many results per group." }),
});

export function searchRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia().use(session).get(
    "/search",
    {
      signedIn: true,
      query: searchQuery,
      response: { 200: searchResultsSchema, 401: problemSchema, 422: problemSchema },
      detail: {
        summary: "Search the collection",
        description:
          "Folders, lists and albums matching `q` by folder or list name, album title or artist credit, ignoring case and accents, with no typo tolerance (FR-12.4, FR-12.5). Each group is ordered as the app orders it: names that start with the query, then those with a word that does, then the rest. Trash isn't searched (FR-12.1).",
        tags: ["search"],
        operationId: "search",
      },
    },
    ({ query: { q, limit }, account }) =>
      searchCollection(db, { ownerId: account.id, query: q, limit }),
  );
}
