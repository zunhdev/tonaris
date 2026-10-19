# Tonaris — G1 terms review: Spotify, iTunes Lookup and Qobuz, 19 October 2026

Decision memo for [TON-17](https://linear.app/zunhdev/issue/TON-17). It reviews the provider uses the [TS-41](../tech-spec.md) resolver chain plans:

- Spotify's Web API, for identifiers only;
- Apple's public iTunes Lookup API, for hints;
- Qobuz's public store pages: one request for the album's slug, and one for its facts as hints.

For each use, the memo asks whether it is permitted, and what may be stored, shown to agents through MCP (FR-10), and exported (FR-08). It also covers MusicBrainz, the Cover Art Archive and the service marks, which G1 asks about too.

This is a careful reading of public terms fetched on 19 October 2026, not legal advice. Quotes are verbatim; readings are marked as readings.

## Decisions

The creator decided each question below on 19 October 2026, choosing the recommended option every time.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Spotify's identifier bridge (TS-41 step 3), given Policy III.9 and Terms IV.2.e on transfers | **Keep it and accept the risk**, under the rules in [Spotify](#spotify). |
| 2 | Spotify service links in MCP and the export | **Include them in both.** A link is the user's own input. |
| 3 | Values the user confirms from Apple's prefilled form | **Store them, show them to agents, and export them**, keeping the `itunes-lookup` provenance. |
| 4 | Qobuz store pages | **The slug request, plus the page's facts as transient hints only.** Nothing from Qobuz is stored, and the form isn't prefilled. |
| 5 | Asking Qobuz for API keys | **Don't ask.** Keys aren't granted to individuals, and a key's terms would rule out the store-page hints. |
| 6 | Service marks in the app | **Text only:** service names, with no logos, badges or brand colors. Album rows list their services by name. |

**What this means for TS-15's policy map.** No source produces a withheld field any more. The withheld marker stays for sources added later.

| Source | Stored | Shown to agents | Exported | Why |
| --- | --- | --- | --- | --- |
| `user` | Yes | Yes | Yes | The user's own data |
| `musicbrainz` | Yes | Yes | Yes | Core data is CC0 |
| `coverartarchive` | The URL | The URL | The URL | Images stay their owners'; they are shown through the proxy and never exported as files (FR-08) |
| `itunes-lookup` | Yes | Yes | Yes | Facts the user confirmed; the provenance lets them be found and removed if Apple ever asks |
| Spotify | Never | — | — | Identifiers in memory only (TS-41) |
| Qobuz store pages | Never | — | — | Transient hints only (decision 4) |

## Spotify

**The use.**
- Client credentials, from a development-mode app owned by the creator's Premium account. No Spotify user ever signs in.
- `Get Track` gives a track link's parent album, and `Get Album` gives its UPC.
- The UPC is sent as a MusicBrainz barcode query, and then forgotten.
- Nothing from Spotify is shown, stored or exported. The stored service link is the URL the user pasted. ([TON-15](2026-10-19-g1-spotify-bridge.md))

**Documents.**
- [Developer Terms](https://developer.spotify.com/terms), "Version 10, effective as of 15 May, 2025".
- [Developer Policy](https://developer.spotify.com/policy), "Effective as of 15 May, 2025".
- [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) and the [design guidelines](https://developer.spotify.com/documentation/design), both undated.
- The [February 2026 announcement](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security) and [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
- The [July 2026 quota update](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates).

**What the terms say.**

| Clause | Text | Reading |
| --- | --- | --- |
| Terms II.8, "Spotify Content" | "any content, data, information or material made available through the Spotify Platform, Spotify Service or by Spotify … metadata, playlists, and user data" | No exception for identifiers, so a UPC from the API counts. |
| Policy III.9 | "Do not build an SDA that enables the transfer of data to another service, except for the purpose of enabling a user to transfer their personal data, or the metadata of the user's playlists to another service." | Read literally, a UPC sent to MusicBrainz is a transfer. **This is the main risk.** |
| Terms IV.2.e | "do not transfer Spotify Content to third parties, including directly or indirectly transferring any data (including aggregate, anonymous or derivative data) received from Spotify to, or use such data in connection with, any ad network, ad exchange, data broker…" | Its examples are advertising and data brokers, but its first words are general. |
| Policy III.5 | "Do not create any product or service which is integrated with streams or content from another service." | It sits among streaming clauses. Tonaris shows no Spotify content next to others', but the wording is broad. |
| Terms IV.3.a.i, IV.3.b | "you may not store, aggregate or create compilations or databases of Spotify Content, other than as strictly necessary to operate your SDA … Do not store Spotify Content indefinitely." Caching only "as strictly necessary … limited to the temporary caching of: (i) metadata and cover art" | Using an identifier in memory and discarding it fits. A cache entry keyed by a Spotify UPC wouldn't. |
| Policy III.14, Terms IV.2.a.i | "Do not use the Spotify Platform or any Spotify Content to train a machine learning or AI model or otherwise ingest Spotify Content into a machine learning or AI model." | Nothing from the API reaches agents. The pasted Spotify URL does (decision 2). |
| Policy II.4 | Displayed metadata must be attributed with the Spotify Marks and "accompanied by a link back" | Not triggered: Tonaris displays no Spotify metadata. |
| Terms III.1.a, Policy III.10 | Applications are licensed "for private personal use", and "Spotify is for personal, non-commercial use" | Tonaris is personal and non-commercial. |
| Terms IV.2.d.i | No "robot, spider, site search/retrieval application, or other tool to retrieve, duplicate, or index any portion of the Spotify Service or Spotify Content" | Rules out reading open.spotify.com pages instead of the API. |
| Terms IX.8.e | Spotify "may suspend or end your access to the Spotify Platform or individual permissions that your SDA has not used or accessed within a 90-day period with or without notice" | A risk if Spotify links are pasted rarely. |

**Development mode.**
- Spotify keeps it for "learning, experimentation, and personal projects for non-commercial use by individual developers". It "should not be relied on as a foundation for building or scaling a business". Tonaris fits the stated purpose.
- The 5-user cap counts "authenticated", "authorized" or allowlisted Spotify users. Client credentials authenticate none, so Tonaris's members don't count. This is a reading of the text; no page says it outright.
- Extended quota is only for organizations with at least 250k monthly active users, so it is out of reach.
- "If the owner's Premium subscription lapses, the app will stop working."

**Decision 1: keep the bridge and accept the risk.**
- **The argument for it.** The UPC is a public industry code printed on the product, and MusicBrainz publishes the same barcode whenever the lookup succeeds. Nothing Spotify-specific leaves Tonaris or stays in it.
- **The argument against it.** III.9 and IV.2.e don't carve out identifiers.
- **The realistic downside.** Spotify revokes the app. Spotify links then fall back to MusicBrainz's URL lookup (37% in TON-15) and manual entry.

The bridge runs under these rules:

1. **Identifiers only.** The UPC and the parent album id live in memory for the job. They are never stored, logged, cached, sent to agents or exported. Spotify titles, artists and artwork are never used, not even as hints.
2. **No cache entry keyed by a Spotify value** when MusicBrainz misses. A hit's key is MusicBrainz's own barcode or URL.
3. **No Spotify values in errors or logs.** Query strings are stripped from MusicBrainz URLs in errors, logs, Sentry and the job's `last_error`.
4. **Fetched again on each attempt.** A retried job calls Spotify again rather than keeping values in `jobs.payload`.
5. **An off switch.** One setting skips step 3, so the bridge can be turned off at once if Spotify objects.
6. **A daily health check.** One `Get Album` call checks that the token works (the Premium subscription) and that `external_ids.upc` is still there. The same call keeps the app in use for IX.8.e.
7. **No scraping** of open.spotify.com.

**Decision 2: Spotify links go to agents and into the export.**
- The link is user input that the user pasted, not data obtained through the Spotify Platform.
- Agents need it to match duplicates and to open albums (FR-10), and the export promises all of the user's data (FR-08).
- The residual risk is the broad "made available … by Spotify" definition, read together with III.14.

**Residual risks.**
- A literal reading of III.9 and IV.2.e (accepted).
- III.5's broad wording.
- Development mode's fragility:
  - the Premium subscription;
  - an undisclosed quota shared across the account;
  - `external_ids` was removed in February 2026 and restored in March;
  - Spotify may revoke access at any time and without notice (IX.8.c–e).

## Apple: iTunes Lookup

**The use.**
- The keyless `itunes.apple.com/lookup?id=…` gives an album's title, artist, release date and track count, used as hints for a strict MusicBrainz match (TON-16).
- When MusicBrainz finds nothing, the manual form is prefilled with title, artist and date, and the user completes it.
- Apple artwork, previews and the paid Apple Music API are not used.

**Documents.**
- The [Search API page](https://performance-partners.apple.com/search-api) has no date (© 2022); the [archived documentation](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) is dated 2017-09-19.
- The [Performance Partners terms](https://docs.partnerize.com/terms_and_conditions/apple_services/2.0/UK/EN.pdf) (effective 7 June 2019) bind accepted partners only.
- The [website terms](https://www.apple.com/legal/internet-services/terms/site.html) date from 2009.
- The [Apple Media Services terms](https://www.apple.com/legal/internet-services/itunes/us/terms.html) were last updated 14 September 2026.
- The [Apple Music identity guidelines](https://marketing.services.apple/apple-music-identity-guidelines) (© 2023).
- The [Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) (13 October 2026).

**What the terms say.**
- **The purpose fits.** The Search API page: "You can also call an ID-based lookup request to create mappings between your content library and the digital catalog." That is what step 4 does.
- **Its content rules don't apply.** They cover "Promo Content": "previews of songs and music videos, and album art". That content may be used only to promote the store, next to a store badge. Tonaris uses none of it.
- **Rate and caching.** "The Search API is limited to approximately 20 calls per minute (subject to change)", and "Large websites should set up caching logic for the search and lookup requests". Responses carry `cache-control: max-age=86400`.
- **The website terms.** They bar robots that obtain information "through any means not purposely made available through the Site". The Lookup API is purposely made available.
- **The Apple Media Services terms.** They ban using content "to train, fine-tune, or improve any artificial intelligence model". They are a consumer contract tied to an Apple Account; keyless server calls use none, and showing an album to an agent isn't training.
- **The paid route is narrower.** MusicKit forbids calls "for purposes unrelated to facilitating access to Your end users' Apple Music subscriptions" (DPLA §3.3.6(D)), which is why it isn't used.
- **No clause restricts storing or passing on the facts themselves:** title, artist, date, track count. Facts aren't copyrightable in the US. In the EU, one album per pasted link is far from a substantial part of Apple's database.

**Decision 3: confirmed values are ordinary album data.**
- They are stored, shown to agents and exported, keeping `itunes-lookup` provenance until the user edits them, so they could be found and removed if Apple ever asked.
- Only title, artist and date are prefilled. The track count is a hint only.
- No artwork, previews or Apple store URLs are kept; the service link is the user's own URL.
- Lookups stay under 20 a minute and may be cached for up to a day.

**Residual risks.**
- The API is legacy and comes with no service promise. A developer-forum post in April 2026 reported `/search` failing while `/lookup` worked, and the rate limit is "subject to change".
- Apple's partner terms describe the Search API as a tool given "upon Apple's approval". Its EPF page sends uses "outside of promoting the Apple Music service" to Music Atlas, though that is aimed at "record labels and music content providers".

## Qobuz

**The uses.**
- **Request A, the slug:** one `GET www.qobuz.com/us-en/album/-/{id}` with redirects off, reading only the `Location` header. This lets step 2 match the store URLs MusicBrainz keeps (TON-14).
- **Request B, hints:** fetch the album's store page, and read its title, artist and date as hints for a strict MusicBrainz match. TON-99 measures how well this works.

**Documents.**
- The [API terms](https://static.qobuz.com/apps/api/QobuzAPI-TermsofUse.pdf), effective 1 September 2011 and still served.
- The [general conditions](https://www.qobuz.com/us-en/legal/terms). The English text is undated; the French one is [v202607](https://static.qobuz.com/legal/CGV_FR_v202607.pdf).
- The [legal notices](https://www.qobuz.com/us-en/legal/mentions).
- The [AI Charter](https://community.qobuz.com/ai-charter), v2, September 2026.
- [robots.txt](https://www.qobuz.com/robots.txt), last modified 12 October 2026.

**API keys (decision 5).**
- There is no developer portal. The [partnerships page](https://www.qobuz.com/us-en/page/annonceurs-partenariats) offers api@qobuz.com to manufacturers.
- Qobuz's replies, as quoted by people who asked, are consistent:
  - "We are not able to provide API credentials to individual users" ([Roon forum, 2022](https://community.roonlabs.com/t/is-there-a-qobuz-rest-api/183752));
  - "Access is granted only to professional partners as part of a commercial or technical integration" ([qobuz-mcp, 2026](https://github.com/DannyIsYog/qobuz-mcp)).
- A key would also bring the 2011 terms. Those forbid "accessing or giving access to the Service or Content in any other way than through the API", limit use to Qobuz subscribers, and require the notice "This application uses the Qobuz API but is not certified by Qobuz".
- **Not asked.** The answer is recorded from this evidence.

**Store pages.**
- **robots.txt allows album pages.** www.qobuz.com disallows checkout, account, player and search paths, but not `/{locale}/album/`. It blocks AI crawlers such as GPTBot and ClaudeBot by name. open.qobuz.com and play.qobuz.com disallow everything.
- **The legal notices forbid extraction.** "XANDRIE SA is the producer of the database of the website www.qobuz.com and any extraction or reuse of this database, as defined in Articles L 342-1 and L 342-2 of the French Intellectual Property Code, is forbidden."
- **The general conditions bind customers.** Art. 17 forbids reproduction "for purposes other than their intended use". They bind customers who accepted them at sign-up; an anonymous fetch is bound loosely at most.
- **Qobuz opposes scraping.** Its AI Charter says it will "Prohibit 'crawling' or 'scraping' of the catalog content on Qobuz", and album pages carry `noai`.
- **EU law favours single lookups.** The Database Directive lets a lawful user of a public database take "insubstantial parts of its contents … for any purposes whatsoever" (art. 8(1)), and a contract can't override that (art. 15). What is barred is repeated, systematic extraction that adds up (art. 7(5)).
- **Reading.**
  - Request A takes a URL, not database content. It is low risk.
  - Request B takes three facts of one album per pasted link. It is defensible as an insubstantial, transient use.
  - Storing the facts would be the "reuse" the legal notices name.

**Decision 4: request A, and request B as transient hints only.**
- Both are user-initiated: one request per pasted link, to www.qobuz.com only, never open. or play.
- Both use an honest User-Agent and follow no further links. There is no crawling, and no backfill of saved albums.
- Request B reads only the page's facts. The HTML, values, images and prices are discarded when the job ends.
- When MusicBrainz finds nothing, the manual form has only the link. Nothing from Qobuz is stored, so the MCP and export questions don't arise.
- If robots.txt starts to disallow album pages, the requests stop.

**A finding for TON-99.** The page's `MusicAlbum` data has no `byArtist`; the artist is in the `Product` block's `brand.name`. Some dates are coarse: *Chicago II* shows `1970-01-01`.

**Residual risks.**
- Qobuz can change its robots.txt or terms; both changed on 12 October 2026.
- Its CDN may block the requests.
- An explicit objection from Qobuz would end request B.

## MusicBrainz and the Cover Art Archive

- **MusicBrainz.** Its [core data](https://musicbrainz.org/doc/MusicBrainz_Database) is CC0. That covers every field Tonaris keeps: titles, artist credits, types, dates, barcodes, MBIDs, and relationships, including the recording dates of TS-46.
  - Tags, genre associations, ratings and annotations are "supplementary data" under CC BY-NC-SA 3.0. Tonaris doesn't use them.
  - Using them later would bring attribution and share-alike duties into the export.
- **Cover Art Archive.** "All images are copyrighted by their respective copyright owners" ([coverartarchive.org](https://coverartarchive.org/)).
  - Tonaris shows the release group's front through its image proxy (TS-103) and exports the URL, never the file (FR-08).
  - Residual risk: the proxy's cache holds copies for display. They stay transient, and a takedown request is met by removing the URL.

## Service marks (decision 6)

- **Spotify.**
  - "Don't use the Spotify brand together with any other brand … Pairing of brands is not permitted under our Developer Terms."
  - Its icon has a 21px minimum.
  - Its call-to-action strings are "OPEN SPOTIFY, PLAY ON SPOTIFY or LISTEN ON SPOTIFY".
- **Apple** allows only its own badge artwork ("Use only the badge artwork provided by Apple"), with the "Listen on" message, and placed first next to other services' badges.
- **Qobuz** publishes no guidelines, and its legal notices forbid reproducing its marks "without the consent of XANDRIE SA and its partners".

DS-25's chooser lists all three logos at 14–16px, so it can't follow these rules. **Decided: service names in plain text,** such as "Open in Spotify", with no logos, badges or brand colors. Naming a service to say where a link goes is ordinary referential use. No provider-sourced content needs attribution: nothing Spotify-derived is shown, Apple's rules attach only to Promo Content, and MusicBrainz core data is CC0.

## What this changes elsewhere

- **PRD:**
  - G1 records these decisions.
  - FR-08.8's open question is answered, and the Qobuz API key question is no longer unverified.
  - D3 and D7 are updated, and the change log has a 19 October terms-review round.
- **Tech spec:**
  - TS-15 gets its policy values.
  - TS-41 gets the Spotify bridge rules, the Apple values' status, the Qobuz requests, and closes its legal-review item.
- **Design spec:** text-only service marks in DS-11, DS-12, DS-19, DS-21 and DS-25.
- **Linear:**
  - TON-99 keeps measuring the Qobuz hints, without a prefill.
  - TON-42 (the resolver chain) gets the Spotify and Qobuz rules.
  - TON-25 still records the G1 matching rules and the Q-01 targets.
