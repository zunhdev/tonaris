// The Postgres side of the domain's `ProviderCache` port (TS-41): the API hands `providerCacheStore(db)` to the
// providers' clients.

import { and, gt, inArray, lte, sql } from "drizzle-orm";

import type { ProviderCache } from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import { providerCache } from "./schema";

export function providerCacheStore(db: Database): ProviderCache {
  return {
    async get(keys, now) {
      if (keys.length === 0) return new Map();
      const rows = await db
        .select({ key: providerCache.key, value: providerCache.value })
        .from(providerCache)
        .where(and(inArray(providerCache.key, [...keys]), gt(providerCache.expiresAt, now)));
      return new Map(rows.map((row) => [row.key, row.value]));
    },

    async set(entries, expiresAt) {
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
