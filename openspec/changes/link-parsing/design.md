# Design

## Context

- **The G1 spike's parser** (`tooling/src/spikes/g1-musicbrainz/links.ts`) already handled most TS-40 forms over about 400 real links, and was written to be replaced by TON-39. It is spike code: it throws on short-link failures, keeps the album id in `id` for Apple song links, and defaults a missing Apple storefront to `us`.
- **`packages/providers`** is empty apart from its entry point. TS-05 puts link parsing there, beside the MusicBrainz and provider clients to come.
- **`streamingServices`** lives in `packages/db/src/schema/collection.ts`, without `tidal`. `album_service_links` has no rows written by any command yet: service links come with TON-46.
- **The outcome vocabulary** already has `unsupported_link` (422) and `provider_unavailable` (503), and `failure(code, detail)` builds a `failed` outcome (TS-27). `describe.ts` already words `unsupported_link` for when no detail is given.
- **Checked live on 24 October 2026:**
  - `music.apple.com/album/{id}`, with no storefront, redirects to the `us` store;
  - `music.apple.com/{sf}/song/{slug}/{id}` pages exist;
  - `spotify.link/{code}` answers Bun's `fetch` with a `307` and a `Location`, and an unknown code redirects to `https://open.spotify.com/`.
- **`safeFetch`** (TS-103) is TON-40, not yet built.

## Goals / Non-Goals

**Goals:**
- **One parser** for every pasted link, runtime-neutral, so the API, MCP and later the web app (paste detection, DS-48) can share it.
- **A result the chain can use directly:** what the link names, what it knows of the album, and the request A inputs for Qobuz (TS-41).
- **Failures in the TS-27 vocabulary,** with reasons written for people.

**Non-Goals:**
- **Identification** (TON-42), including the iTunes Lookup that finds a `/song/` link's album.
- **`safeFetch`** (TON-40). The short-link resolver takes a fetcher, and nothing calls it in production yet.
- **Storing links,** conflicts and manual link editing (TON-46).
- **The capture popover and endpoint** (TON-42, TON-43).
- **Forms outside TS-40:** legacy `itunes.apple.com` links, embed links, and text around a link. They fail as unsupported. `play.qobuz.com` track links are the exception: the web player's form of the `open.qobuz.com` track links TS-40 lists, so they are accepted.

## Decisions

### 1. Where the vocabulary and the parser live

- **`packages/domain/src/links.ts`** holds what every layer shares:
  - `streamingServices` (`spotify`, `apple-music`, `qobuz`, `tidal`) and `linkKinds` (`album`, `track`);
  - `serviceNames`, the names people read ("Apple Music"), for failure reasons now and the service chooser later (DS-25);
  - `LinkRef`, `{service, kind, id}`, and `sameLink(a, b)` (decision 4).
- **`packages/db`** imports `streamingServices` from the domain, as it does `releaseTypes`, so the check constraint can't drift from the parser.
- **`packages/providers/src/links.ts`** holds `parseLink()` and `resolveShortLink()`. It imports only the domain: no Bun or Node APIs, so it runs in browsers too.
- **Alternative:** the parser in the domain. Rejected: TS-05 puts link parsing with the provider clients, and the short-link resolver is a network step.

### 2. The result

```ts
type ParsedLink = LinkRef & {
  albumId?: string;    // the album's id, when the link names it: album links, and Apple `?i=` links
  storefront?: string; // Apple's, from the path
  locale?: string;     // Qobuz store links: the store and slug, for request A (TS-41)
  slug?: string;
  url: string;         // canonical (TS-40)
};

type LinkParse =
  | { status: "parsed"; link: ParsedLink }
  | { status: "short"; url: string }            // resolve with resolveShortLink
  | { status: "failed"; failure: Failure };     // unsupported_link
```

- **`id` is what the link names:** the album for album links, the song for track links. For an Apple `?i=` link that is the song, with the album in `albumId`.
  - TS-40's `{…, id, trackId?}` put the album in `id` for Apple song links only. The single meaning makes equivalence (decision 4) one comparison, and fits `/song/` links, which have no album id.
  - TS-40 is updated to match.
- **Failures are TS-27 outcomes,** built with `failure()`, so the chain returns them as they are.

### 3. The forms and canonical URLs

| Service | Hosts | Paths | Canonical |
| --- | --- | --- | --- |
| Spotify | `open.spotify.com`; URIs `spotify:(album\|track):{id}` | `(/intl-{xx})?/(album\|track)/{id}`, id 22 base-62 characters | `https://open.spotify.com/{kind}/{id}` |
| Apple Music | `music.apple.com`, `geo.music.apple.com` | `(/{sf})?/album(/{slug})?/{id}`, with `?i={song}` for a song; `(/{sf})?/song(/{slug})?/{song}`. Ids are digits, storefronts two letters. | Album `https://music.apple.com/{sf}/album/{id}`; `?i=` song `…/album/{albumId}?i={id}`; `/song/` `https://music.apple.com/{sf}/song/{id}`. `{sf}/` only when given. |
| Qobuz | `www.qobuz.com`, `qobuz.com`; `open.qobuz.com`, `play.qobuz.com` | `(/{locale})?/album/{slug}/{id}`; `/(album\|track)/{id}`. Ids are letters and digits. | `https://open.qobuz.com/{kind}/{id}` |
| Tidal | `tidal.com`, `www.tidal.com`, `listen.tidal.com` | `(/browse)?/(album\|track)/{id}(/u)?`, ids digits | `https://tidal.com/{kind}/{id}` |

- **Apple's storefront stays as pasted,** and a link without one stays without one. Apple then picks the store; defaulting to `us` could open a store that doesn't sell the album.
- **Qobuz opens through `open.qobuz.com`,** the form that hands over to the app (FR-06.6) and stores no store. The store and slug ride along for request A.
- **Qobuz ids are lowercased.** They are base-36, so case carries nothing, and equivalence then holds across case.
- **Every query parameter is dropped,** except Apple's `i`. So are fragments and a trailing slash.

### 4. Equivalence

`sameLink(a, b)` compares service, kind and id. Canonical URLs aren't compared: two Apple links under different storefronts have different canonical URLs and are the same link (TS-40).

### 5. Hostile input (Q-05)

- **Trimmed,** and at most 2,048 characters.
- **`https` or `http` only;** `http` canonicalises to `https`.
- **No credentials and no port,** or the link is unsupported. A credentialed link would otherwise be stored and shown.
- **Hosts match the allowlist exactly,** so `open.spotify.com.example.net` and `evilspotify.com` are unsupported. Path segments match exactly, and ids match their service's pattern.
- **Nothing is fetched** by `parseLink()`.

### 6. Short links

- **`parseLink()` recognises** `spotify.link` and `spotify.app.link`, and answers `short` with the `https` URL.
- **`resolveShortLink(url, fetcher)`:**
  - one `GET` per hop, with `redirect: "manual"`, and at most 3 requests;
  - a `3xx` with a `Location` on `spotify.link` or `spotify.app.link` is the next hop;
  - one on `open.spotify.com` is parsed: an album or track, or else unsupported;
  - any other host is unsupported, and isn't requested;
  - another answer, or a fourth hop, is unsupported;
  - a `5xx` or `429`, or a fetcher that throws, is `provider_unavailable`.
- **The fetcher is required,** not defaulted to `fetch`. Production passes `safeFetch` (TON-40), which adds the SSRF checks, the 5 s timeout and the User-Agent, so no caller can bypass the guard by omission.
- **Bodies are cancelled,** as only the status and `Location` matter.

### 7. Reasons

Written in DS style, and recorded in DS-48 as built:

| Case | Reason |
| --- | --- |
| Not a link of the four services | "This doesn't look like a Spotify, Apple Music, Qobuz or Tidal album or track link." (the same as `describe.ts`) |
| A service's link that isn't an album or track | "Only {Service} album and track links can be added." |
| A service's album or track link with a malformed id | "This {Service} link looks incomplete. Copy it again from {Service}." |
| A short link that leads nowhere | "This Spotify short link doesn't lead to an album or track." |
| A short link that can't be reached | "Couldn't reach Spotify to open this short link. Try again." |

### 8. Tests

- **`packages/providers/src/links.test.ts`:**
  - a fixture table of real variants per service, each with its expected service, kind, id, album id and canonical URL: the creator's links, the spike samples' forms, and the live checks;
  - every link in the G1 samples (`tooling/fixtures/g1-*/links.txt`) parses;
  - unsupported and hostile input;
  - equivalence across each fixture group;
  - the resolver with a scripted fetcher, including the off-allowlist host that is never requested.
- **`packages/domain/src/links.test.ts`:** `sameLink()`.
- **`packages/db/src/schema.test.ts`:** a `tidal` link saves, and an unknown service is refused.

### 9. The migration

`drizzle-kit generate` replaces `album_service_links_service_check` with one that allows `tidal`.

## Risks / Trade-offs

- **[Services change their link forms]** → A new form fails as unsupported, with manual entry offered (FR-02.3). Adding it is one table row and a fixture.
- **[`/song/` links need a lookup TON-42 doesn't yet plan]** → TS-41 and TON-42 gain the iTunes Lookup by song id, the same rate-limited API Apple hints use.
- **[`spotify.link` may answer browsers differently]** → It answered Bun's `fetch` with a `307` on 24 October 2026. `safeFetch` sends a non-browser User-Agent, and an answer without a redirect fails as unsupported.

## Migration Plan

The constraint only widens, and no rows exist yet. Rolling back drops it and recreates it without `tidal`.
