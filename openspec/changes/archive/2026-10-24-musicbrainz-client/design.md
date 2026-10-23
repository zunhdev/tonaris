# Design

## Context

- **`safeFetch`** (TON-40) guards every outbound request and sends Tonaris's User-Agent, which carries a contact as MusicBrainz asks. It times out after 5 s and leaves queries out of its errors.
- **The G1 spike's client** (`tooling/src/spikes/g1-musicbrainz/musicbrainz.ts`) paced requests start to start and retried 503s with backoff, sending about 1,000 requests without trouble. It cached raw answers on disk, keyed by the full request URL.
- **Response shapes, checked live on 24 October 2026:**
  - `/ws/2/url` with several `resource`s answers `{urls: […]}`, which is empty when none is known. With one unknown resource it answers 404;
  - `inc=release-rels+release-group-rels` names each URL's releases and release groups;
  - a barcode search answers `{releases: [{id, title, barcode, release-group}]}`.
- **TS-90's `jobs` table doesn't exist yet.** The schedules say it arrives "with the work that needs them, such as email retries and MusicBrainz lookups". Captures, the first jobs, are TON-42.
- **`packages/db` may depend only on the domain** (`tooling/src/workspace-check.ts`), so it can't import a port type from `packages/providers`.

## Goals / Non-Goals

**Goals:**
- **One client** that keeps every MusicBrainz request within the limit, however many captures run.
- **Lookups the chain and enrichment can use directly,** cached as TS-41 says, with the Spotify rules built in rather than left to each caller.

**Non-Goals:**
- **The chain** (TON-42), **enrichment's parsing** of releases and release groups (TON-43), and **the image proxy** (TON-48).
- **The `jobs` table.** Captures bring it in TON-42.
- **Pacing across instances.** The API runs as one instance (TS-104); see the risks.

## Decisions

### 1. An in-process queue, not a table of jobs

- **The `MusicBrainz` class owns the queue.** Each request waits for its turn, and turns start at least 1,000 ms apart, start to start. The API makes one instance and shares it.
- **Why not one `jobs` row per request:**
  - one capture asks several questions in turn, each depending on the last (URL, then barcode, then release);
  - durable retries belong to the capture as a whole, which TON-42 queues;
  - pacing is about requests, and a process-wide queue paces them exactly.
- **How the queue works:**
  - it is a promise chain, so turns are FIFO and none is skipped;
  - a request's turn passes once it starts, so a slow answer doesn't hold the queue. MusicBrainz limits rate, not concurrency.
- **Testing:** the clock and `sleep` are injectable, so tests run 50 lookups in simulated time.

### 2. Busy answers and failures

- **Retried:**
  - `503`, and `502` and `504`, which MusicBrainz's proxies also give;
  - `safeFetch`'s `timeout`, `network` and `dns` failures.
- **How a retry waits:**
  - the wait is `max(Retry-After, 2^attempt)` seconds: 1, 2, 4, 8. The spike saw `Retry-After: 0` when the global limit refuses everyone, so the backoff floor stays;
  - the wait moves the queue's next start, so every waiting lookup holds back, not just the one refused;
  - the retry joins the queue again.
- **After 4 retries** the lookup throws `ProviderUnavailableError` (`provider: "musicbrainz"`). TON-42 maps it to `provider_unavailable` and retries the capture job later (TS-90).
- **Answers:**
  - `404` is "unknown": an empty answer for URLs, `null` for an MBID;
  - other statuses throw an `Error` at once, naming the path only: a malformed request is a fault to see, not load to wait out;
  - `safeFetch`'s other refusals (`url`, `address`) and unparsable bodies throw `ProviderUnavailableError` at once, without retries.
- **Messages name the path** (`/ws/2/release`), never the query, so no barcode or URL reaches a log (TS-41).

### 3. The lookups

| Method | Request | Cache key per entry | Answer |
| --- | --- | --- | --- |
| `urls(forms, {cacheMisses})` | `/ws/2/url?resource=…&resource=…&inc=release-rels+release-group-rels` | `musicbrainz:url:{form}` | each form's targets: `{kind: "release" \| "release-group", id, title}` |
| `barcodes(forms, {cacheMisses})` | `/ws/2/release?query=barcode:a OR barcode:b&limit=100` | `musicbrainz:barcode:{barcode}`, the release's own | releases whose barcode is exactly one of `forms`: `{id, title, barcode, releaseGroupId}` |
| `lookup(entity, mbid, inc)` | `/ws/2/{release\|release-group}/{mbid}?inc=…` | `musicbrainz:{entity}:{mbid}:{inc, sorted}` | the JSON, or `null` on 404. TON-43 parses it. |
| `search(entity, query, limit)` | `/ws/2/{release\|release-group}?query=…` | none: step 4's queries come from store pages, whose data isn't kept | the JSON |
| `releaseGroupFront(mbid)` | `HEAD coverartarchive.org/release-group/{mbid}/front-500`, redirects not followed | `coverartarchive:release-group-front:{mbid}` | `https://coverartarchive.org/release-group/{mbid}/front-500` on a `3xx`, `null` on `404` |

- **Answers are kept as small typed values,** not raw responses, so one URL lookup over several forms fills one entry per form.
- **MBIDs must be UUIDs** before they go into a path.
- **The Cover Art Archive isn't paced:** it is archive.org's service, outside MusicBrainz's limit. It still goes through `safeFetch`, and its `5xx`s throw `ProviderUnavailableError` (`provider: "coverartarchive"`).

### 4. Which answers are kept

- **Found forms are always kept,** each under the form MusicBrainz answered with: the URL as it stores it, the barcode as the release carries it.
- **Forms MusicBrainz didn't know** are kept as empty entries only when `cacheMisses` is true.
  - The option is required, so a caller can't forget it.
  - TON-42 passes `false` for Spotify-derived values: a UPC, and a parent album's URL from `Get Track` (TS-41).
- **When a lookup over several forms sends no request:** when every form is kept, or when one is kept as found.
  - Without the second rule, a Spotify lookup would always ask again, as its misses are never kept.
  - The earlier answer it repeats covered all the forms at once.
- **MBID lookups and artwork** keep 404s too. An MBID isn't a Spotify value.
- **Identical requests in flight** share one promise, keyed by the request URL, so a batch with duplicates asks once.

### 5. The cache port and its table

- **The port, in `packages/providers`:**

  ```ts
  type ProviderCache = {
    get(keys: readonly string[], now: Date): Promise<Map<string, unknown>>; // unexpired only
    set(entries: readonly { key: string; value: unknown }[], expiresAt: Date): Promise<void>;
  };
  ```

  `memoryCache()` implements it for tests and tooling.
- **`packages/db`'s `providerCacheStore(db)`** returns the same shape structurally, as the db can't import the type. An `apps/api` test wires the two together, which checks the types and the round trip.
- **The `provider_cache` table:** `key text` primary key, `value jsonb`, `expires_at`, and an index on `expires_at`. `set` upserts.
- **`prune-provider-cache`** runs daily under the TS-90 schedules.
- **Values are always JSON objects or arrays,** never a bare `null`.
- **Room for later:** keys are namespaced, so iTunes Lookup's one-day cache (TS-41) can share the table.

### 6. Tests

- **`packages/providers/src/musicbrainz.test.ts`,** with a simulated clock and scripted answers:
  - **50 lookups at once:** starts 1 s apart, the User-Agent sent, duplicates sharing a request, the same batch again sending nothing, and expiry after 7 days;
  - **the Spotify rules:** a miss kept nothing, and a hit was kept under MusicBrainz's barcode;
  - **busy answers:** two 503s then an answer, waits growing and `Retry-After` honoured, the queue held back for others, and the failure after the last retry naming no query;
  - **404s;**
  - **the Cover Art Archive:** a redirect, a 404 and a 5xx.
- **`packages/db/src/provider-cache.test.ts`:** get and set, expiry, upsert, prune.
- **`apps/api/src/provider-cache.test.ts`:** the client answering from Postgres, and the schedule pruning.

## Risks / Trade-offs

- **[A second API instance would double the rate]** → TS-104 already assumes one instance. If the API scales out, the queue's next start moves to Postgres, a row updated under lock, or to a MusicBrainz mirror (TS-41's scale-out path).
- **[Answers up to 7 days old]** → MusicBrainz edits made since then are missed for a week. Enrichment of saved albums (TON-43) can ask with the cache bypassed, if that proves needed.
- **[A long retry]** → Retries can hold a lookup for about 15 s, plus 5 s per attempt. Captures are jobs and show a pending state (TS-41), so nobody waits on a request.

## Migration Plan

One additive migration creates `provider_cache`. Rolling back drops it: the cache is rebuilt by use.
