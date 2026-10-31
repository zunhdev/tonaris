# Design

## Context

Services are one list in `packages/domain` (`streamingServices`); the database's checks, the OpenAPI enums and most of the web app derive from it. Parsing is `packages/providers/src/links.ts`, step 2's URL forms `link-forms.ts`, and the chain `identify.ts`, with Qobuz's and Tidal's hints from `store-pages.ts`. The spike (TON-128) prototyped the parser and the Data API reads in `tooling/src/spikes/`. The app has no terms or privacy notice; accounts are Better Auth's `user` rows, which the session guard reads on every request.

## Decisions

### 1. Link forms

`music.youtube.com`, `www.youtube.com`, `youtube.com` and `m.youtube.com`. `/playlist` with `list=OLAK5uy_` plus 33 characters is an album; `/watch` with such a `list` and an 11-character `v` is a track in it. Both keep the album's id and the canonical `https://music.youtube.com/playlist?list={id}`: the album's link is what's saved, as a track link stands for its album (FR-02.3). Any other YouTube path or playlist fails with a reason that points to YouTube Music's Share menu. Ids are case-sensitive and kept as pasted.

### 2. The Data API client

`YouTubeData` in `packages/providers` makes the spike's three reads through `safeFetch`, sending the key in the `X-Goog-Api-Key` header so it never sits in a URL, a log or an error. `playlists.list` asks `snippet,contentDetails`, so the playlist's `itemCount` gives the track count at no extra cost. Nothing is cached. A 404 or an empty answer gives no hints; a 400 or 403 (quota, a bad key) gives no hints and logs an error without the key, so a link goes to manual entry rather than failing; timeouts, 429 and 5xx throw `ProviderUnavailableError("youtube")`.

### 3. The track-count check

`Hints` gains an optional `tracks`, which only YouTube's hints set, and `Candidate` the release's `track-count` from the search. When `tracks` is set, a release passes only if its track count equals it, so an EP of the album's name doesn't pass on the album's playlist (the spike's one error). Apple's hints carry a track count under another name and stay unchecked, as TS-41 decided.

### 4. Who YouTube is read for

`IdentifyContext` gains `mayReadYouTube()`, asked only when step 4 is reached for a YouTube link: true when the key is set and the owner agreed to the current terms. Agents' captures read it too, as Apple's lookup (TS-41). Without it, the link goes to manual entry, with no prefill either way.

### 5. Opening

`appLink` returns nothing for YouTube Music, so "App" opens its page. Phones hand `music.youtube.com` to the app when installed.

### 6. The terms' version and agreement

`termsVersion` in `packages/domain` is the date the texts last changed. `user.terms_version` holds the version a member agreed to and `terms_agreed_at` when; Better Auth reads them as fields clients can't set, so the session guard's `Account` carries `termsAgreed` with no extra query. Joining records the current version in the transaction that creates the account, and for someone who already had one, after they sign in through the invitation. `POST /v1/me/terms` with the version the page showed records it, and answers 422 when the terms changed meanwhile.

### 7. The pages and the screen

`/terms` and `/privacy` are public, server-rendered pages in the sign-in frame, wider for reading, with the support address from `GET /v1/support`. The sign-in frame links both under its card, as does the shared page's footer, and the account menu, on every workspace page, opens each in a new tab. The workspace shows a one-time screen instead of the collection while `termsAgreed` is false: what changed, links to both, **Agree and continue**, and **Sign out**. A new version later asks again the same way.

### 8. oasdiff

`link.set`, `link.remove` and `defaults.setHiddenServices` list services in their request schemas, so adding one changes them, which oasdiff reads as a removal. Their exact messages go into `oasdiff-ignore.txt` with TON-131's note; responses' enums are additive warnings already.
