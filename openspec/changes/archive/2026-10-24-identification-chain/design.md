# Design

## Context

- **Built:**
  - `parseLink()` and `resolveShortLink()` (TON-39);
  - `safeFetch` (TON-40);
  - `MusicBrainz` with its paced queue and the `provider_cache` table (TON-41).
- **The G1 spikes** wrote every piece of the chain as measurement code in `tooling/src/spikes/`: URL forms, barcode forms, the Spotify client and bridge, iTunes Lookup, Qobuz's requests A and B, Tidal's page, robots.txt parsing and the step-4 rules.
  - The decisions of 21 October 2026 changed two of the rules: only official albums and EPs, and cleaning that keeps "(Taylor's Version)".
  - The spikes' raw response caches were never committed. Their committed results keep no store-page strings, which mustn't be kept.
- **`album_service_links`** has `entity_id`, but nothing writes links yet (TON-46). Step 1 needs a rule for what `entity_id` holds.
- **`inputNeeds`** is `destination`, `name` and `match`. Nothing asks for an album's details yet.
- **The root `.env`** holds the creator's Spotify development-mode app credentials, which TON-15 used.

## Goals / Non-Goals

**Goals:**
- **One function** answers what a pasted link is, for the app and for agents, in TS-41's order and under its rules.
- **Every provider rule enforced by construction,** not left to callers:
  - Spotify values held in memory only;
  - store pages limited, and none for agents;
  - iTunes Lookup paced.
- **Tests replay real MusicBrainz and iTunes answers,** recorded once, for the spikes' step-4 cases.

**Non-Goals:**
- **The capture command, its job and endpoint, matching and enrichment** (TON-43, TON-44, TON-45). `identify()` answers, and they act on the answer.
- **Storing links** (TON-46), beyond the `entity_id` rule step 1 needs.
- **Artwork** (TON-48).

## Decisions

### 1. Where things live

`packages/providers/src/`:

| File | Holds |
| --- | --- |
| `paced-queue.ts` | `PacedQueue`, the turn-taking queue from `MusicBrainz`, extracted so iTunes Lookup, Spotify and store pages pace the same way |
| `itunes.ts` | `ItunesLookup`: album and song lookups, at most one every 3 s, kept a day |
| `spotify.ts` | `Spotify`: client credentials, `album()` for the UPC and `parentAlbum()` for a track's album |
| `store-pages.ts` | `StorePages`: Qobuz's requests A and B, Tidal's page, robots.txt and hint extraction |
| `hints.ts` | title cleaning, the step-4 search and the strict rule |
| `link-forms.ts` | step 2's URL forms and step 3's barcode forms |
| `identify.ts` | `createIdentifier()` and the `identify()` it returns, and `identificationOutcome()` |

`packages/domain/src/links.ts` gains `linkEntityId()`, and `outcomes.ts` gains the `details` need. `packages/db` gains `findLinkedAlbum()`.

### 2. The answer

```ts
type Identification =
  | { status: "linked"; link: ParsedLink; albumId: string }                    // step 1
  | { status: "identified"; link: ParsedLink; step: 2 | 3 | 4; releaseGroupId: string }
  | { status: "ambiguous"; link: ParsedLink; step: 2 | 3 | 4; candidates: { releaseGroupId: string; title: string }[] }
  | { status: "unidentified"; link: ParsedLink; reason: string; prefill?: { title: string; artist: string; year: number; source: "itunes-lookup" } }
  | { status: "failed"; failure: Failure };                                     // unsupported_link, provider_unavailable
```

- **`link` is the pasted link,** after any short link. For a Spotify track it stays the track: the parent album's id never leaves the chain.
- **`reason`** is a sentence for people (DS-48). It is recorded in the design spec as built.
- **`identificationOutcome()`** maps the answer to TS-27:

  | Answer | Outcome |
  | --- | --- |
  | `ambiguous` | `needs_input` with `need: "match"` and the candidates |
  | `unidentified` | `needs_input` with `need: "details"` and one candidate, `{url, reason, prefill?}` |
  | `failed` | the failure |
  | `linked`, `identified` | `undefined`: the capture goes on, to matching and enrichment |

  `details` is new in `inputNeeds`. It is additive (TS-09), and the OpenAPI document is regenerated.

### 3. The chain

`identify(input, {agent, linked})`:
- `agent` is true for MCP captures;
- `linked(service, entityId)` is step 1's lookup, bound to the owner.

**Step 0.**
- `parseLink()`, then `resolveShortLink()` through `safeFetch` for short links.
- Unsupported input fails with `unsupported_link`, and a short link Spotify can't answer with `provider_unavailable`.

**Step 1.**
- `linked(service, linkEntityId(link))`. The entity id is the album's id when the link names one (album links, Apple `?i=` links), else `track:{id}`.
- Album and track ids can't collide that way.
- TON-46 stores links with the same function.

**Track links without an album:**
- Tidal and Qobuz go straight to `unidentified`, with their reasons and no request.
- A Spotify track asks `Get Track` for its parent album, held in memory. With the bridge off, it is `unidentified`.
- An Apple `/song/` link asks iTunes Lookup for its song. The answer gives the album id (`collectionId`) and the album's hints at once.

**Step 2: `musicBrainz.urls(forms)`,** in one request.

| Service | Forms (spike-measured, TS-41) |
| --- | --- |
| Spotify | `https://open.spotify.com/album/{id}`. For a track, the parent's URL, with `cacheMisses: false` |
| Apple | `https://music.apple.com/{sf}/album/{id}` for the link's storefront and `us gb de fr jp ca au nl se it es fi` |
| Qobuz | `open.` and `play.` forms; with the slug from the link or request A, the locale-less store URL and the store URL under common locales |
| Tidal | `https://tidal.com/album/{id}`, the `/browse` form, `http://www.` and `listen.` forms |

- Release-group targets count directly.
- Release targets are looked up, up to 10, with `inc=release-groups`. Each lookup is cached by MBID.
- One album means `identified`, several `ambiguous`, none goes on.

**Step 3: `musicBrainz.barcodes(forms)`.**
- **Qobuz:** a 13-digit numeric album id, with `cacheMisses: true`.
- **Spotify:** `Get Album` on the pasted album, or the parent, gives the UPC, with `cacheMisses: false`. Skipped when the bridge is off.
- **The forms:** the digits padded to 12, 13 and 14 where they fit.
- **Albums:** one, several or none, as in step 2.

**Step 4: hints, then the rule (decision 4).**
- **Apple:** iTunes Lookup in the link's storefront, then `us` and `gb`.
- **Qobuz:** request B, skipped for agents.
- **Tidal:** its page, skipped for agents.
- **Spotify:** none. Its titles are never hints.

**Step 5.**
- The answer is `unidentified`.
- Apple's hints become the prefill.
- Store-page hints never do, by construction: `StorePages` hands them only to step 4.

**Qobuz's request A** runs once per link, before step 2, when the link has no slug. Agents run it too.
- It reads only `Location`, and cancels the body.
- If it answers the page itself (slug `-`), request B reuses that answer, unless the capture is an agent's.

### 4. The step-4 rule

Ported from the spikes' recommended rule, with the decisions of 21 October 2026.

- **Search.** `release:"{cleaned title}" AND artist:"{first artist}"` with `limit=100`. If that finds nothing, `release:"{cleaned title}"` alone.
  - The release groups found, up to 50, get their first release dates from one `rgid:` search.
  - Searches aren't cached (TON-41).
- **Title cleaning.**
  - It drops Apple's ` - EP` and ` - Single`, trailing notes naming an edition, and `(feat. …)`.
  - Edition notes are those with words such as *deluxe*, *remaster*, *edition*, *expanded*, *anniversary*, *bonus*, *version*, *mono*, *reissue*, *special*, *explicit* or *standard*.
  - A note naming a re-recording is kept: `{name}'s Version`, or *re-recorded*.
- **What passes:**
  - the cleaned titles agree on letters and digits;
  - the hint's artist, or its first artist, is one of the candidate's credited, artist or sort names (sort names unsorted too), on letters and digits;
  - the hint's year is the release's year or its album's first year;
  - the release is `Official`, and its album is an `Album` or `EP`. A `Single` also passes when Apple's title ended in ` - Single`.
- **The decision:** exactly one album passing is `identified`. Several is `ambiguous`, none goes on.

### 5. Store pages

- **Only `www.qobuz.com` and `tidal.com`,** through `safeFetch` with manual redirects. Each request sends the honest User-Agent and has a 5 s timeout.
- **One request a second per host** (`PacedQueue`). TS-41 doesn't set a pace; this keeps a batch polite.
- **Qobuz:**
  - **request A:** `GET https://www.qobuz.com/fr-fr/album/-/{id}`. It is for open. and play. links, since a store link keeps its own store;
  - **request B:** the page its `Location` names, or the store link itself, following one redirect to the same album;
  - **hints** come from the `MusicAlbum` name, the `Product` brand and the date.
- **Tidal:** `GET https://tidal.com/album/{id}`, following one redirect to the same album. Its hints come from the `MusicAlbum` name, artists and date. A 404 yields no hints.
- **robots.txt:**
  - read at most once a day per host, and kept in `provider_cache` (`robots:{host}`, one day);
  - the test is `/fr-fr/album/x/0` for Qobuz and `/album/0` for Tidal, for the agent `Tonaris`, under RFC 9309's longest match;
  - while album pages are disallowed, or robots.txt can't be read, no request is made and the step has no hints.
- **Failures:**
  - a 404, or a redirect to another album, means no hints;
  - a 5xx, 429 or 403, a timeout, or a broken connection is `ProviderUnavailableError`, so the capture can be retried.
- **Nothing from a page outlives the call.** Hints go to step 4 and are dropped; the HTML is never kept or logged.

### 6. iTunes Lookup

- **The requests:**
  - `GET https://itunes.apple.com/lookup?id={id}&country={sf}` through `safeFetch`, one every 3 s (`PacedQueue`);
  - for a `/song/` link, the same with the song's id, whose `track` result carries the album's `collectionId` and hints.
- **What is kept:** only `{title, artist, date, trackCount, albumId}`, in `provider_cache` for a day (`itunes:lookup:{id}:{sf}`). No artwork, previews or store URLs, as TS-41 forbids.
- **A failed lookup** throws `ProviderUnavailableError` (`provider: "itunes"`).

### 7. Spotify

- **The token:** client credentials, held in memory until a minute before it expires.
- **The calls:**
  - `album(id)` gives `{upc?}`;
  - `parentAlbum(trackId)` gives the album id;
  - a 404 is "none".
- **Pace:** one call every 250 ms. A 429 waits `Retry-After`, up to 3 times.
- **Nothing is cached, and errors name the call, never an id.** A failure throws `ProviderUnavailableError` (`provider: "spotify"`).
- **Configuration:**
  - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`;
  - `SPOTIFY_BRIDGE=off` is the off switch, and missing credentials also turn the bridge off.
- **`spotify-health`,** daily: one `album()` call on *Random Access Memories*.
  - It logs a failure if the call throws or gives no UPC, naming no value.
  - It runs only when the bridge is on.

### 8. Recorded fixtures

- **The cases** are in `packages/providers/fixtures/identify/cases.ts`: each pasted link, its options, its synthetic stubs and its expected answer.
  - Spotify answers are synthetic, using barcodes MusicBrainz already holds, so no Spotify value is committed.
  - Qobuz and Tidal pages are minimal HTML whose JSON-LD carries MusicBrainz's facts for the album, never a store's.
  - Where a real answer can't be relied on, a case stubs MusicBrainz too: a made-up barcode, two albums for one URL, and a lasting 503.
- **`packages/providers/fixtures/identify/record.ts`** runs each case against the real MusicBrainz and iTunes Lookup, with the case's stubs for every other host. It writes their answers, keyed by URL, to `recorded.json` beside it.
  - MusicBrainz's are CC0. They are cut down to the fields the chain reads, to keep the file small (about 150 KB).
  - iTunes answers are cut down to the fields decision 6 keeps.
  - It lives beside its fixtures, so `tooling` needn't depend on `packages/providers`.
- **`identify.test.ts`** replays the recording through `createSafeFetch` with a connection that serves recorded or stubbed answers. An unrecorded request fails the test.

### 9. In the API

- **`apps/api/src/providers.ts`** composes the identifier from the config: `MusicBrainz` and `ItunesLookup` on `providerCacheStore(db)`, `StorePages`, and `Spotify` when configured.
- **`apiSchedules`** gains `spotify-health` when Spotify is on.
- **Nothing calls `identify()` yet.** The capture command does, in TON-44 or TON-45.

## Risks / Trade-offs

- **[MusicBrainz's search index changes]** → The recorded answers are a snapshot, so tests stay stable while live results drift. Re-recording is one command.
- **[Store pages change shape]** → Hints extraction then finds nothing, and links go to manual entry. TS-41's measurement can be re-run with the spike tools.
- **[Spotify revokes the app]** → Step 3 fails for Spotify. `ProviderUnavailableError` makes captures retryable, the daily check logs it, and `SPOTIFY_BRIDGE=off` stops the calls.
- **[A large chain per link]** → A Qobuz link can take two page requests, about five MusicBrainz requests and two searches. At 1 MusicBrainz request a second, a batch of 50 takes minutes, as TS-41 expected. Captures show a pending state.

## Migration Plan

No schema change. Deploying needs `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for the bridge. Without them, Spotify links use steps 2 and 5 only.
