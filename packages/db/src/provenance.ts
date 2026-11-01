// Where each album value came from (TS-15): one `album_provenance` row per field with a value. Policy flags derive
// from the source, in `@tonaris/providers`' policy map. A value set to unknown loses its row: unknown has no source.

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  enrichableFields,
  type EnrichableField,
  type EnrichableFields,
  type ProvenanceEntry,
} from "@tonaris/domain";

import type { Executor, Transaction } from "./client";
import { albumProvenance as provenance } from "./schema";

/** Inserts `entries` for the album, replacing the rows of the fields they name. */
export async function writeProvenance(
  tx: Transaction,
  albumId: string,
  entries: readonly ProvenanceEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx
    .insert(provenance)
    .values(entries.map((entry) => ({ albumId, ...entry })))
    .onConflictDoUpdate({
      target: [provenance.albumId, provenance.field],
      set: {
        source: sql`excluded.source`,
        sourceRef: sql`excluded.source_ref`,
        retrievedAt: sql`excluded.retrieved_at`,
      },
    });
}

/** Removes the rows of `fields`, whose values are now unknown. */
export async function clearProvenance(
  tx: Transaction,
  albumId: string,
  fields: readonly EnrichableField[],
): Promise<void> {
  if (fields.length === 0) return;
  await tx
    .delete(provenance)
    .where(and(eq(provenance.albumId, albumId), inArray(provenance.field, [...fields])));
}

/**
 * A person's write of `values` (TS-15): `user` for each field given a value, and no row for one set to unknown.
 * An agent writes for its person, so its values are `user` too. Fields left undefined keep their rows.
 */
export async function recordUserValues(
  tx: Transaction,
  albumId: string,
  values: Partial<EnrichableFields>,
): Promise<void> {
  await writeProvenance(tx, albumId, userEntries(values));
  await clearProvenance(
    tx,
    albumId,
    enrichableFields.filter((field) => values[field] === null),
  );
}

/** `user` for each field `values` gives a value: a person's write (TS-15). */
export function userEntries(values: Partial<EnrichableFields>): ProvenanceEntry[] {
  return enrichableFields
    .filter((field) => values[field] !== undefined && values[field] !== null)
    .map((field) => ({ field, source: "user", sourceRef: null, retrievedAt: null }));
}

/** The album's provenance, by field. */
export async function albumProvenance(db: Executor, albumId: string): Promise<ProvenanceEntry[]> {
  return db
    .select({
      field: provenance.field,
      source: provenance.source,
      sourceRef: provenance.sourceRef,
      retrievedAt: provenance.retrievedAt,
    })
    .from(provenance)
    .where(eq(provenance.albumId, albumId))
    .orderBy(asc(provenance.field));
}
