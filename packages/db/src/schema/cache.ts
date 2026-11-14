// Provider answers kept for a while (TS-41): MusicBrainz's and the Cover Art Archive's for 7 days, iTunes Lookup's
// albums and each store's robots.txt for a day (TON-42). Keys are namespaced by provider, such as
// `musicbrainz:url:{url}`, `itunes:lookup:{id}:{storefront}` and `robots:{host}`. Nothing here is user data: expired rows are pruned daily
// (TS-91), and losing the table only costs requests.

import { index, jsonb, text } from "drizzle-orm/pg-core";

import { instant, table, timestamps } from "./columns";

export const providerCache = table(
  "provider_cache",
  {
    key: text().primaryKey(),
    value: jsonb().notNull(),
    expiresAt: instant().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.expiresAt)],
);
