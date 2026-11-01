// Where provider answers are kept for a while (TS-41): MusicBrainz's and the Cover Art Archive's for 7 days, iTunes
// Lookup's and robots.txt's for a day. The port is the domain's `ProviderCache`; the API keeps its entries in
// Postgres (`providerCacheStore` in packages/db), and tests and tooling keep them in memory.

import type { ProviderCache } from "@tonaris/domain";

/** A cache in this process's memory, for tests and tooling. */
export function memoryCache(): ProviderCache & {
  size(): number;
  /** Everything kept, expired or not: for tests that check what a lookup left behind. */
  entries(): [string, unknown][];
} {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async get(keys, now) {
      const found = new Map<string, unknown>();
      for (const key of keys) {
        const entry = entries.get(key);
        if (entry && entry.expiresAt > now.getTime()) found.set(key, entry.value);
      }
      return found;
    },
    async set(kept, expiresAt) {
      for (const { key, value } of kept) {
        entries.set(key, { value: structuredClone(value), expiresAt: expiresAt.getTime() });
      }
    },
    size: () => entries.size,
    entries: () => [...entries].map(([key, { value }]) => [key, value]),
  };
}
