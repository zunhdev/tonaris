// The Postgres side of `ProviderCache` in packages/providers (TS-41), which this package can't import (TS-05): the
// API hands `providerCacheStore(db)` to the MusicBrainz client, and the shapes must agree.

import { and, gt, inArray, lte, sql } from "drizzle-orm";

import type { Database, Transaction } from "./client";
import { providerCache } from "./schema";

export function providerCacheStore(db: Database) {
  return {
    /** The entries among `keys` that haven't expired by `now`. */
    async get(keys: readonly string[], now: Date): Promise<Map<string, unknown>> {
      if (keys.length === 0) return new Map();
      const rows = await db
        .select({ key: providerCache.key, value: providerCache.value })
        .from(providerCache)
        .where(and(inArray(providerCache.key, [...keys]), gt(providerCache.expiresAt, now)));
      return new Map(rows.map((row) => [row.key, row.value]));
    },

    /** Keeps `entries` until `expiresAt`, replacing what is kept under their keys. */
    async set(entries: readonly { key: string; value: unknown }[], expiresAt: Date): Promise<void> {
      // One statement can't update a row twice, so a key given twice keeps its last value.
      const rows = [...new Map(entries.map(({ key, value }) => [key, value]))].map(
        ([key, value]) => ({
          key,
          value,
          expiresAt,
        }),
      );
      if (rows.length === 0) return;
      await db
        .insert(providerCache)
        .values(rows)
        .onConflictDoUpdate({
          target: providerCache.key,
          set: {
            value: sql`excluded.value`,
            expiresAt: sql`excluded.expires_at`,
            updatedAt: sql`now()`,
          },
        });
    },
  };
}

/** Removes entries that expired by `now` (TS-91). */
export async function pruneProviderCache(
  db: Database | Transaction,
  now: Date = new Date(),
): Promise<void> {
  await db.delete(providerCache).where(lte(providerCache.expiresAt, now));
}
