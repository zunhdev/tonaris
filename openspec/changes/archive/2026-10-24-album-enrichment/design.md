# Design

## Context

- **Built:**
  - `MusicBrainz.lookup()` keeps answers by MBID and `inc` for 7 days, and answers null for a 404. `releaseGroupFront()` gives the Cover Art Archive's stable `front-500` address, or null (TON-41).
  - `identify()` answers a release group id (TON-42).
- **The `albums` table** has `mb_release_group_id`, `mb_release_id` and `artwork_url`. Clients' album records carry only the seven fields a person edits: title, artist, release type, live, original year and recording years (TS-11, TON-20). Nothing writes the MBIDs or artwork yet.
- **`album_provenance`** exists, with `(album_id, field)` as its key, `source`, `source_ref` and `retrieved_at`. Nothing writes it yet. `provenanceSources` is declared in `packages/db`.
- **`executeMutation()`** takes the owner's write lock, runs a domain command, and logs its changes at consecutive `seq`s. The change log allows a null `mutation_id`.
- **MusicBrainz's shapes**, checked on 24 October 2026:
  - **Merges and deletions.** A release group lookup of a merged id answers the group it now belongs to, under its new id; `fcd3637b…` answers as `d6d1de65…`. A deleted id, `60179d2e…`, answers 404.
  - **Releases.** A lookup with `inc=releases` lists at most 25 releases, by date, each with its status.
  - **Recording relationships.** A release lookup with `inc=recordings recording-level-rels place-rels area-rels event-rels` gives each recording its "recorded at" place relationships with `begin`/`end`, and its "recorded at" event relationships with the event's `life-span` inline.

## Goals / Non-Goals

**Goals:**
- **One decision for every enrichment:** a new album's, a retry's and a newly matched link's, as a pure function in the domain.
- **The rule holds under concurrency.** The decision is made on the album as it is under the owner's write lock, so a person's edit made while MusicBrainz was being asked is never overwritten.
- **Tests replay real answers,** recorded once, for the scenarios' albums.

**Non-Goals:**
- **The capture command and its job** (TON-44, TON-45). They call `describeAlbum()`, `planEnrichment()` and `enrich()`.
- **Matching against merged ids** (TON-44). This change stores the new id when an album is enriched.
- **Showing artwork** (TON-48). Enrichment fills `artwork_url`; clients get it with the image proxy.
- **Apple's prefill provenance** (TON-45). The manual-entry save that keeps `itunes-lookup` for unedited prefilled values comes with the capture form.
- **Re-checking every saved album** on a schedule. TS-44 doesn't ask for it.

## Decisions

### 1. Where things live

| Package | File | Holds |
| --- | --- | --- |
| `domain` | `enrichment.ts` | `provenanceSources`, the facts' type, `planEnrichment()`, `blankAlbum` |
| `providers` | `album-facts.ts` | `describeAlbum()`, `classify()`, `recordingYears()` |
| `providers` | `policy.ts` | `policyVersion`, `policy`, `filterFields()` |
| `db` | `enrichment.ts` | `enrichAlbum()`, `albumReleaseGroup()` |
| `db` | `provenance.ts` | writing and reading `album_provenance`, and `albumProvenance()` |
| `api` | `providers.ts` | `enrich()`, composed from the above and the hub |

- **The rule in the domain.** Like a command, `planEnrichment()` decides and never commits. Unlike one, it reads nothing: it gets the album and the facts, and answers a plan. A store interface would add nothing.
- **The rejected alternative** was a `CollectionStore` command. Enrichment isn't a client's mutation: it has no `mutationId`, no `base` and no principal.

### 2. The facts

```ts
type EnrichableFields = AlbumFields & { artworkUrl: string | null };
type EnrichableField = keyof EnrichableFields;
type Sourced<T> = { value: T; source: ProvenanceSource; ref: string };

type AlbumFacts =
  | {
      status: "found";
      askedId: string;          // the release group asked about
      releaseGroupId: string;   // the id MusicBrainz answered under: another one after a merge
      values: { [F in EnrichableField]?: Sourced<NonNullable<EnrichableFields[F]>> };
    }
  | { status: "deleted"; askedId: string };
```

- **`values` holds only what the source has.** A missing fact is absent, never null, so it can't be mistaken for a value.
- **`ref`** is the release group's MBID, or for recording years the release's.

### 3. `describeAlbum(musicBrainz, releaseGroupId)`

1. `lookup("release-group", id, ["artist-credits", "releases"])`. Null means `deleted`.
2. **The values:**
   - title, and artist credit as each credit's name and join phrase;
   - original year from `first-release-date`'s year, absent when it is empty;
   - classification by `classify()` (decision 4).
3. **For a live album only:**
   - the first release with status `Official`, by date, undated last, else the first release;
   - `lookup("release", id, ["recordings", "recording-level-rels", "place-rels", "area-rels", "event-rels"])`;
   - `recordingYears()` (decision 5).
4. **Artwork:** `releaseGroupFront(releaseGroupId)` on the id MusicBrainz answered under. A `ProviderUnavailableError` from the Cover Art Archive leaves artwork absent.
5. **Errors:** a `ProviderUnavailableError` from MusicBrainz propagates, so the capture's job retries (TS-90).

Both lookups are kept 7 days by `MusicBrainz.lookup()`.

### 4. `classify(primaryType, secondaryTypes)` (TS-45, decided 24 October 2026)

| Primary type | Release type | Live |
| --- | --- | --- |
| Album | `compilation` with the secondary type Compilation, else `album` | Live among the secondary types |
| EP | `compilation` with Compilation, else `ep` | Live among the secondary types |
| none | `compilation` with Compilation, else absent | `true` with Live, else absent |
| Single, Broadcast, Other, or a type MusicBrainz adds later | absent (Unclassified) | `false` |

- **Absent means unknown,** so enrichment leaves the field for a person.
- **Singles' `false`** keeps them out of Live: with secondary types, they are still Unclassified.

### 5. `recordingYears(release)` (TS-46)

- **Each recording's dates:**
  - the `begin` and `end` of its "recorded at" and "recorded in" relationships;
  - if none of them is dated, the `life-span` `begin` and `end` of the events it was recorded at.
- **The range:** the smallest and largest year among every recording's dates, or none when no recording is dated.
- **A single year** is a range from that year to itself, as manual entry saves it.

### 6. `planEnrichment(album, facts)` (TS-42, TS-44)

`album` is the album as saved: its fields, `artworkUrl` and `releaseGroupId`. For a new album it is `blankAlbum`, whose fields are null or blank.

**Identity first:**

| Saved release group | Facts | Identity | Values |
| --- | --- | --- | --- |
| the asked id or none | `found`, same id | `unchanged`, or `set` when none | filled |
| the asked id | `found`, another id | `merged`: the new id is stored | filled |
| the asked id | `deleted` | `deleted`: the id is cleared | kept |
| none | `deleted` | `unchanged` | kept |
| another id | any | `elsewhere` | nothing is written |

**Then the values:**
- **A missing value** is null, or a blank title or artist. Only missing values are filled.
- **The recording range is one value:** filled only when both its years are missing, and only when the album is live after the fill.
- **Each filled value** gets a provenance entry: its field, source, `ref` and the enrichment's time.

**The plan:** `{ identity, releaseGroupId?, values, provenance }`. An empty plan writes nothing.

### 7. `enrichAlbum(db, accountId, albumId, facts, now)`

In one transaction:
1. Take the owner's write lock, shared with `executeMutation()` as `lockAccount(tx, accountId)`.
2. Read the album, with its MBID and artwork, and check that the account owns it. A missing album answers `not_found`.
3. Plan, then write:
   - the filled columns and the release group id, with the search keys if the title or artist was filled;
   - the provenance entries, replacing any earlier entry for those fields.
4. **If a client field was filled,** log one album `update` with the album as clients see it and a null mutation id, through `logChanges()`, shared with `executeMutation()`. A plan that fills only artwork or identity logs nothing, because clients don't hold those.

It answers `{ plan, changes }`, and the caller publishes `changes`.

### 8. Provenance of a person's writes

The store's `insertAlbum()` and `updateAlbum()` write provenance in the same transaction:
- `insertAlbum()` writes `user` for every non-null field;
- `updateAlbum()` writes `user` for every field set to a value, and removes the entry of a field set to null, since an unknown value has no source.

Agents' writes are `user` too: an agent writes for the person (TS-15 has no agent source). Field names are the API's: `title`, `artistCredit`, `releaseType`, `isLive`, `originalYear`, `recordingYearStart`, `recordingYearEnd`, `artworkUrl`.

### 9. Policy (TS-15)

- **`policy`** maps each source to `{ store, agentVisible, exportable, attribution }`, under `policyVersion = 1`. Every current source is stored, visible to agents and exportable, with no attribution.
- **`filterFields(values, sources, use, flags = policy)`:**
  - `use` is `"agent"` or `"export"`;
  - a field whose source's flag is off is replaced by `{ withheld: "provider-policy" }`;
  - a field without a source passes, such as ids or unknown values.
- The MCP serializer (M9) and the export builder (M10) call it. `describeAlbum()` emits only sources whose `store` flag is on.

### 10. In the API

`createProviders(config, db, hub)` gains `enrich(accountId, albumId)`:
1. read the album's saved release group with `albumReleaseGroup()`. An album with none has nothing to enrich from;
2. `describeAlbum()` for it;
3. `enrichAlbum()`, and publish its changes to the hub.

The capture job calls it, for a retry or a newly matched link (TON-44). A new album's capture uses `describeAlbum()` and `planEnrichment(blankAlbum, …)` directly.

### 11. Recorded fixtures

- **`packages/providers/fixtures/describe/cases.ts`:** each case's release group id, its stubs and its expected facts. The albums:
  - *Bleach*, the studio album;
  - *The Köln Concert*, a live album recorded on one night;
  - *Live/1975–85*, a live compilation recorded over years, whose first release is a bootleg;
  - a single;
  - the merged and the deleted release groups from the G2 corpus.
- **Stubs** stand in for an archive without a front, an archive answering 503, and MusicBrainz answering 503 throughout.
- **`record.ts`** runs the cases against MusicBrainz and the Cover Art Archive, and writes `recorded.json`:
  - MusicBrainz's answers (CC0) are cut down to the fields enrichment reads;
  - the archive's are kept as status and `Location` only, with no image.
- **`album-facts.test.ts`** replays them, and fails on an unrecorded request.

## Risks / Trade-offs

- **[A lookup lists 25 releases]** → They come by date, so the first official release is among them unless 25 earlier releases aren't official. Then the first release is used, and its recordings are the album's too.
- **[A live album's first release lacks dates that a later edition has]** → Its recording years stay unknown and FR-05.6's fallback shows. The person can enter them.
- **[A merged id is noticed only when the album is enriched]** → Until then, the album keeps the old id, which still answers. TON-44 compares merged ids when matching.
- **[Large answers for live albums]** → A release with recordings and relationships is about 50 KB. It is asked only for live albums, and kept 7 days.
- **[Policy flags that withhold nothing]** → Withholding is tested with a policy passed in, so the path works when a source needs it.

## Migration Plan

No schema change and no new configuration. Albums saved before this change have no provenance; their next edit or enrichment writes it.
