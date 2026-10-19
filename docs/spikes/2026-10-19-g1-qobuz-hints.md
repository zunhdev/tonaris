# Tonaris — G1 spike: Qobuz store-page hints and a strict MusicBrainz match, 19 October 2026

Spike for [TON-99](https://linear.app/zunhdev/issue/TON-99). Qobuz has no API that Tonaris may use, and most Qobuz album ids are alphanumeric, so the barcode bridge (TS-41 step 3) can't apply to them. This spike measures a Qobuz version of step 4, the one [TON-16](2026-10-19-g1-apple-hints.md) measured for Apple:

- Qobuz's public store page supplies the album's title, artist and date, from its schema.org data;
- a MusicBrainz release search uses them as hints;
- the match is accepted only when exactly one album passes.

The questions are how often that identifies the album, how often it would be wrong, and what the two store requests cost.

The harness follows the rules the [G1 terms review](2026-10-19-g1-terms-review.md) set for Qobuz (decision 4):

- one request per link and per kind, to www.qobuz.com only, with Tonaris's User-Agent;
- robots.txt checked before each run;
- no other links followed, and nothing from the pages kept.
  - `results.json` holds the hints' dates, MusicBrainz's names and the links as the fixtures give them.
  - Qobuz's titles and artist names exist only while a link is matched.

## Verdict

**Qobuz's store pages identify albums as precisely as Apple's hints, with TON-16's rule plus G2's restriction to official albums and EPs.**

- **The recommended rule** never matched a wrong album. It identified **48 of 71** labelled links (68%), and **48 of the 60** that had page hints (80%).
  - It takes TON-16's loose titles and artist names, with the release year or the album's first year, and no track count.
  - It considers only official releases of albums and EPs, as the [G2 spike](2026-10-19-g2-album-matching.md) proposed.
  - Among the links step 2 (the URL lookup) misses, it adds 9 of 19, and 9 of the 12 with hints (75%).
- **The restriction to official albums and EPs earns its place.** Without it, TON-16's rule matched one wrong album and found 5 fewer right ones. Bootlegs, singles and promotional releases that share a title made those links ambiguous.
- **The year check still matters.** Without it, one wrong match comes back and ambiguity rises from 3 links to 15.
- **On the G1 sample's 24 Qobuz links:**
  - steps 2 and 3 identified 13 in TON-14, counting *BRAT*, whose two releases are one album;
  - step 4 adds 6: *Икра*, *Sun Arcs*, *New Adventures in Hi-Fi*, *What Will the Neighbours Say?* and two albums Wikidata doesn't link to MusicBrainz, which matched on title, artist and exact date;
  - that makes 19 (79%), with no wrong album.
- **The creator's links:** 3 of 5 are identified, against 2 with steps 2 and 3. Step 4 adds *Икра*, whose title has no Latin letters.
  - *The Nutcracker* (Rattle) fails on classical credits: Qobuz names the conductor and the composer in the title.
  - *Are You Experienced* got no hints, because the page was asked for in the US store, which doesn't sell this edition. The creator's own store, `fi-en`, does.
- **The store locale is the biggest gap.** 11 of 74 pages answered 404. Only one locale was asked per link: `us-en` for open. and play. links, the link's own for store links.
  - 4 of the 11 albums exist in `fi-en` or `fr-fr`.
  - The other 7 are in none of the three. They are probably ids Qobuz has dropped since Wikidata or MusicBrainz recorded them.

With no errors in 48 accepted matches, the error rate is plausibly below about 6% (the rule of three, 3/48). That is a sample bound, not a guarantee. TON-16's 47 Apple matches without an error point the same way.

## Sample

There are 74 Qobuz links in [`tooling/fixtures/g1-qobuz/`](../../tooling/fixtures/g1-qobuz/), drawn by [`sample.ts`](../../tooling/src/spikes/g1-qobuz-hints/sample.ts):

| Sample | Links | Labelled | Known by URL (step 2) | With page hints |
| --- | --- | --- | --- | --- |
| The creator's links | 5 | 5 | 2 | 4 |
| Wikidata, MusicBrainz release group known (the TON-14 stratum) | 15 | 15 | 6 | 12 |
| Wikidata, no MusicBrainz link (the TON-14 stratum) | 4 | 1 | 1 | 4 |
| Qobuz editions in the G2 corpus, one per album | 50 | 50 | 43 | 43 |

- **The issue asked for the G1 sample's Qobuz links.** There are only 24, with 21 labelled. So, as TON-16 did for Apple, the sample adds 50 more.
  - They come from the [G2 corpus](2026-10-19-g2-album-matching.md): the Qobuz links MusicBrainz relates to releases of the G1 albums.
  - Each is labelled with its release's album.
  - One link per album keeps albums with many editions, such as Weezer's, from weighing more.
- **Labels** give each link's true album:
  - Wikidata's P436;
  - a manual MusicBrainz search for 3 of the creator's links;
  - the G2 corpus;
  - or, for links step 2 knows, the album of the release MusicBrainz links them to.
- **The G2 links are mostly known by URL**, because they come from MusicBrainz's URL relationships. They measure the hints and the rule well. What step 4 *adds* comes mostly from the G1 sample.
- **Wikidata and the G2 corpus favor notable albums**, which have more editions and namesakes. That makes precision harder to keep, not easier.

## What the pages give

Each album page carries two schema.org blocks. The `MusicAlbum` block has `name` and `datePublished` but no `byArtist`. The `Product` block has the artist as `brand.name`.

| Pages | Links |
| --- | --- |
| Gave title, artist and date | 63 of 74 (85%) |
| Answered 404 in the locale asked | 11 |
| og:title adds a version note, such as "(Deluxe Edition)", that the `MusicAlbum` name lacks | 16 of 63 (25%) |
| Dated 1 January (probably the year only) | 5 of 63 (8%) |
| Dated the 1st of another month (probably the month only) | 8 of 63 (13%) |

- **The `MusicAlbum` name is the album's title without Qobuz's version note.** The note lives only in og:title and the page title. Matching the name works better: adding the note back cost 2 links.
- **Dates are often coarse, but the year is right.** Where the search found the right album, the page's year was the album's first year in 50 of 54 links (93%), even for reissues. Qobuz dates *Bleach (Deluxe Edition)* to 1989.
- **The 404s come from the store, not the album.** The slug request (request A) answered for every id it was sent, but the page (request B) exists only in stores that sell the album.
  - The 11 albums were checked by hand in `fi-en` and `fr-fr`, the store Qobuz's locale-less URLs send a Finnish address to and Qobuz's home store.
  - Three exist in `fi-en`, among them the creator's *Are You Experienced*. Of the three stores, one exists only in `fr-fr`: Cœur de pirate's first album. Seven exist in none of them.

## Rules

Each rule changes one criterion from the one before, or from the rule it names. None counts tracks: the pages don't show them. Recall counts every labelled link; recall with hints leaves out the 11 labelled links whose page gave none.

| Rule | Accepted | Wrong | Precision | Recall | Recall with hints | Several albums |
| --- | --- | --- | --- | --- | --- | --- |
| Clean titles, artist credit, release year, one album | 38 | 1 | 97% | 52% | 62% | 8 |
| …release year or the album's original year | 41 | 1 | 98% | 56% | 67% | 8 |
| …loose titles and artist names (TON-16's rule) | 44 | 1 | 98% | 61% | 72% | 8 |
| **…official albums and EPs only** (recommended) | **48** | **0** | **100%** | **68%** | **80%** | **3** |
| …with Qobuz's version note in the title | 46 | 0 | 100% | 65% | 77% | 3 |
| …without the year | 37 | 1 | 97% | 51% | 60% | 15 |

**The wrong match** is *Fearless (Taylor's Version)*, which every rule without the official filter matched to the 2008 *Fearless*.
- TON-16's title cleaning treats "(Taylor's Version)" as an edition note, because it contains "version", and drops it. The search then looks for *Fearless*.
- A non-official 2021 release of the 2008 album passed the year check.
- The G2 spike showed that re-recordings are different albums, so the cleaning must keep this note. The same flaw made *Red (Taylor's Version)* ambiguous.

**What the right album's releases fail.** These are the 54 labelled links whose right album the search found:

| Criterion | No release of the right album matches it |
| --- | --- |
| Title, exactly | 8 (15%) |
| Title, with edition notes dropped | 3 (6%) |
| Artist credit, exactly | 5 (9%) |
| Release date | 6 (11%) |
| Release year or the album's original year | 2 (4%) |

## Proposed rule (TS-41 step 4 for Qobuz)

1. **Request A**, for open. and play. links, which lack the store slug: `GET www.qobuz.com/{locale}/album/-/{id}` with redirects off. The `Location` names the slug, which step 2 needs anyway (TON-14).
2. **Request B**, if steps 2 and 3 miss: `GET` the page that `Location` names, on www.qobuz.com only.
   - Store links go straight to their page, in their own locale; a stale slug redirects once.
   - A title without Latin letters has the slug `-`, and request A's answer is already the page.
3. **Hints:** the `MusicAlbum` name as the title, the `Product` block's `brand.name` as the artist, and the date's year.
4. **Search and compare** as in TON-16:
   - The search is by cleaned title and first artist, falling back to the title alone. Then the candidates' release groups are looked up for their first-release dates.
   - Titles and artist names are compared loosely.
   - The year must equal the release's year or the album's first year.
   - Only official releases of albums and EPs count.
5. **The title cleaning must keep "(Taylor's Version)".** Today it drops any parenthesis containing "version", so re-recordings search as their originals. This applies to Apple too.
6. **Accept** when exactly one release group passes. Several albums go to confirmation (TS-26). None passes to step 5, manual entry, which isn't prefilled from Qobuz (TON-17).

## What fails

These are the 12 labelled links with hints that the recommended rule doesn't identify.

- **Several albums (3), which is right to ask about:**
  - *Red (Taylor's Version)*: the title cleaning above.
  - *SZNZ: Autumn*: MusicBrainz has Weezer's EP and a partial compilation with the same title and date.
  - *Et moi, et moi, et moi*: Jacques Dutronc's 1966 EP, and his album, one of whose releases carries that title.
- **The title differs from MusicBrainz's (6):**
  - *Fearless (Taylor's Version)*: the title cleaning again. The search for *Fearless* returned 100 releases of the original, and the re-recording wasn't among them.
  - **MusicBrainz keeps a nickname in the disambiguation, where Qobuz puts it in the title.** That's Weezer's Teal and White albums, both titled *Weezer*, and *Peter Gabriel 3: Melt*, titled *Peter Gabriel* (disambiguation "Melt"). Comparing with "{title} ({disambiguation})" would catch the Weezer cases. Since the search doesn't return disambiguations, that would cost a second search.
  - *The Animals With Sonny Boy Williamson*: Qobuz drops the artist from the title, and dates the album to 1977.
  - A three-album Weezer box, *Blue/Green/Red*. MusicBrainz relates the box's Qobuz link to a release of the Red album, so the label itself is doubtful.
- **Artist names (2):**
  - *Are You Experienced*: Qobuz credits Jimi Hendrix, MusicBrainz The Jimi Hendrix Experience.
  - *The Nutcracker* (Rattle): Qobuz credits the conductor, "Sir Simon Rattle", and titles it "Tchaikovsky Nutcracker".
  - Like Apple's "Berlin Philharmonic", these would need MusicBrainz's artist aliases, at the cost of an artist lookup per candidate.
- **A wrong year (1):** *The Animals*, dated 1983 by Qobuz and titled *Animals*.

## Cost

| Request | Requests | Statuses | Time p50 / p95 |
| --- | --- | --- | --- |
| A, the slug: `/us-en/album/-/{id}` | 29 | 301 × 28, 200 × 1 | 20 / 155 ms |
| B, the page | 79 | 200 × 62, 301 × 6 (stale slugs), 404 × 11 | 82 / 336 ms |
| robots.txt, once per run | 1 | 200 | 245 ms |

- **Per link:** one request to www.qobuz.com for a store link or a title without Latin letters, and two for the rest. That was 40 links and 34 links. A stale slug in a store link adds a second.
  - Pages weigh about 350 KB each, and only three facts are read.
  - The time is spent outside MusicBrainz's queue: a fraction of a second per link.
- **MusicBrainz:** as for Apple, two requests per link that reaches step 4, the release search and the release-group dates. A title-only search adds a third, needed for 6 of 74 links.
- **No throttling.** About 220 requests went to www.qobuz.com, across two runs and the locale checks, spaced 2 s apart. None was refused.
- **One request stalled.** In the first run, one connection to Qobuz's CDN hung for minutes, with no answer. The harness now gives up after 15 s and records the request with status 0. Production needs the same timeout, which the SSRF guard (TS-103) should apply to every outbound request.

## Questions for the terms review (TON-17)

These are handed to [TON-17](https://linear.app/zunhdev/issue/TON-17), whose decision 4 they refine:

1. **Which store locale should request B use** for open. and play. links, which carry none?
   - `us-en`, as TS-41 says for request A, missed 4 albums that `fi-en` or `fr-fr` sell, among them one of the creator's.
   - The options are a per-account Qobuz store setting, a fixed European locale, or Qobuz's locale-less URL. That URL redirects by the *server's* address, so a Frankfurt server would get `de-de`.
   - A second locale on a 404 would break "one request per pasted link".
2. **Is following Qobuz's own redirect allowed?** Request B follows the `Location` of request A, or of a stale store slug: the same album on the same host. The rule "follows no further links" should say so.
3. **May request A's answer serve as the page?** For a title without Latin letters, request A's answer is already the page. Reading it saves request B. TS-41 says request A reads only `Location`.
4. **How often is robots.txt checked?** "The requests stop if robots.txt disallows album pages" needs a cadence. A daily check, like Spotify's health check, would do.
5. **MCP-initiated captures.** Album pages carry `noai`, and Qobuz's AI Charter opposes scraping. When an agent adds a Qobuz link through MCP (FR-10), the server reads the page for that one link, and the agent only ever sees MusicBrainz data. Is that still a user-initiated request under decision 4?

## What this changes elsewhere

- **TS-41:** the Qobuz requests are measured. Whether step 4 uses Qobuz hints, with the rule above, is decided in TON-25 with the other G1 questions; "Still open (G1)" lists them.
- **TON-16's title cleaning:** the "(Taylor's Version)" fix applies to Apple's step 4 too.
- **The G2 proposal to search official albums and EPs only** is now measured. It removed the only wrong match and 5 of 8 ambiguous results.
- **Shared code:** TON-16's rules now accept hints without a track count, and its search and URL-truth helpers are shared. Its behavior is unchanged.

## Running it again

```sh
bun tooling/src/spikes/g1-qobuz-hints/sample.ts   # rebuilds links.txt and labels.json
bun tooling/src/spikes/g1-qobuz-hints/run.ts tooling/fixtures/g1-qobuz/links.txt
```

- There is no cache: nothing from Qobuz may be kept, and MusicBrainz searches carry the page's title and artist.
- `results.json` is written after each link. `--rerun-errors` runs again the links that failed or hadn't run yet.
- `--explain` prints each link's hints to the terminal, never to a file.
- The generated tables are in `tooling/fixtures/g1-qobuz/report.md`.
- The harness reuses TON-14's MusicBrainz client and link parser, and TON-16's search and rules.
