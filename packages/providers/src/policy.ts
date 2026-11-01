// Provider policy (TS-15, FR-08.8): what each source's values may do, by the source recorded in `album_provenance`.
// Decided on 19 October 2026 in the G1 terms review: no current source withholds anything. The marker stays for a
// source added later, so a withheld value is replaced, never silently dropped.

import { withheld, type ProvenanceSource } from "@tonaris/domain";

/** Bumped whenever a flag changes, so exports and agents can say which policy filtered them. */
export const policyVersion = 1;

export type PolicyFlags = {
  /** Whether values from the source may be saved at all. */
  store: boolean;
  /** Whether agents may read them through MCP (FR-10). */
  agentVisible: boolean;
  /** Whether exports include them (FR-08). */
  exportable: boolean;
  /** Attribution owed wherever they are shown, if any. */
  attribution: string | null;
};

const open: PolicyFlags = { store: true, agentVisible: true, exportable: true, attribution: null };

/**
 * The flags by source. MusicBrainz's core data is CC0; Apple's hints are facts the person confirmed; the Cover Art
 * Archive's address is stored, while its image is shown only through the image proxy and never exported (TS-103).
 */
export const policy: Record<ProvenanceSource, PolicyFlags> = {
  user: open,
  musicbrainz: open,
  coverartarchive: open,
  "itunes-lookup": open,
};

/** Who the values are for: an agent through MCP, or an export. */
export type PolicyUse = "agent" | "export";

/**
 * `values` with every field whose source's flag for `use` is off replaced by the `withheld` marker. A field with no
 * recorded source, such as an id or an unknown value, passes as it is.
 */
export function filterFields(
  values: Readonly<Record<string, unknown>>,
  sources: Readonly<Partial<Record<string, ProvenanceSource>>>,
  use: PolicyUse,
  flags: Readonly<Record<ProvenanceSource, PolicyFlags>> = policy,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => {
      const source = sources[field];
      if (source === undefined) return [field, value];
      const allowed = use === "agent" ? flags[source].agentVisible : flags[source].exportable;
      return [field, allowed ? value : withheld];
    }),
  );
}
