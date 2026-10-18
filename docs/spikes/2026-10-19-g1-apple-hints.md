# Tonaris — G1 spike: Apple hints and a strict MusicBrainz match, 19 October 2026

Spike for [TON-16](https://linear.app/zunhdev/issue/TON-16). It measures step 4 of the [TS-41](../tech-spec.md) resolver chain:

- the public iTunes Lookup API (no key) supplies an Apple Music album's title, artist, release date and track count;
- a MusicBrainz release search uses them as hints;
- the match is accepted only when it is unique.

The question is how often that identifies the album, and how often it would be wrong.

**Identity is the album, not the edition.** On 19 October 2026, during this spike, the creator decided that Tonaris identifies the **album**: the MusicBrainz release group, with its canonical title and original year. Edition differences such as "Deluxe" are out of scope for now. Every rule below is scored on whether it finds the right album. TS-41 as written, which needs exactly one *release*, is kept as the baseline.

## Verdict

**Apple hints identify albums precisely enough to accept automatically, with the right rule.**

- **TS-41 as written:** exact title, artist credit, track count and release date, with exactly one release.
  - It never matched a wrong album, but found only **15 of 71** labelled links (21%).
  - The causes: several editions of one album pass at once, and Apple's titles and track counts carry edition noise.
- **The recommended rule:**
  - exactly one *album* passes;
  - titles and artist names are compared loosely;
  - the release year or the album's first year must agree;
  - track count is ignored.

  It found **47 of 71** (66%), and **47 of the 54** that had iTunes hints (87%). **None was wrong.**
  - Among the links step 2 (the URL lookup) misses, it adds 21 of 39 (54%), and 21 of the 26 with hints (81%).
- **The creator's links:** 5 of 6 are identified by steps 2 and 4 together. Step 4 added *Bleach (Deluxe Edition)*, *Икра (Deluxe)* and *EP2*. Only *Tchaikovsky: The Nutcracker (Remastered 2026)* stays unidentified: Apple credits "Berlin Philharmonic", MusicBrainz "Berliner Philharmoniker".
- **The year check is the one that matters.** It was the only criterion that stopped a wrong match: without it, that *Nutcracker* matched a different *Nutcracker* recording.
- **The track count only costs recall.** It never stopped a wrong match, and it rejected 7 of the 51 right albums the search found, because of bonus tracks and deluxe editions.
- **Ambiguity is rare and real.** 2 links matched two albums: MusicBrainz has two Slipknot release groups called *Iowa*. Those should go to confirmation (`needs_input`), never be guessed.

With no errors in 47 accepted matches, the error rate is plausibly below about 6% (the rule of three, 3/47). That is a sample bound, not a guarantee.

## Sample

There are 81 Apple Music links in [`tooling/fixtures/g1-apple/`](../../tooling/fixtures/g1-apple/), drawn by [`sample.ts`](../../tooling/src/spikes/g1-apple-hints/sample.ts):

| Sample | Links | Labelled | Known by URL (step 2) | With iTunes hints |
| --- | --- | --- | --- | --- |
| The creator's links | 6 | 6 | 2 | 6 |
| Wikidata, MusicBrainz release group known (the TON-14 stratum) | 15 | 15 | 8 | 12 |
| Wikidata, no MusicBrainz link (unlabelled) | 10 | 0 | 0 | 9 |
| Wikidata, MusicBrainz release group known (new) | 50 | 50 | 22 | 36 |

- **Labels** give each link's true album:
  - Wikidata's P436, the album's MusicBrainz release group;
  - a manual MusicBrainz search for 4 of the creator's links;
  - or, for links step 2 knows, the release group of the release MusicBrainz links them to.
- **The unlabelled stratum** checks for false positives: albums MusicBrainz probably lacks. No rule matched any of them.
- **18 links had no hints.** All of them are Wikidata ids that iTunes Lookup doesn't have in the US or UK storefront: removed or regional albums. A pasted link comes from a storefront that has the album, and all of the creator's links had hints. So *recall with hints* is the better estimate for real use.
- **Wikidata favors notable albums**, which have more editions and namesakes. That makes precision harder to keep, not easier, though coverage is likely higher than for an average collection.

## Rules

Each rule changes one criterion from the one before, or from the rule it names. Recall counts every labelled link; recall with hints leaves out the 17 labelled links iTunes had no hints for.

| Rule | Accepted | Wrong | Precision | Recall | Recall with hints |
| --- | --- | --- | --- | --- | --- |
| TS-41 as written: one release | 15 | 0 | 100% | 21% | 28% |
| The same criteria, one album | 30 | 0 | 100% | 42% | 56% |
| …clean titles (drop " - EP", " - Single", trailing edition notes) | 31 | 0 | 100% | 44% | 57% |
| …release year instead of release date | 32 | 0 | 100% | 45% | 59% |
| …release year or the album's original year | 40 | 1 | 98% | 55% | 72% |
| …original year, tracks ±1 | 44 | 1 | 98% | 61% | 80% |
| …original year, no track count | 45 | 0 | 100% | 63% | 83% |
| **Loose titles and artist names, original year, no track count** (recommended) | **47** | **0** | **100%** | **66%** | **87%** |
| Loose, tracks ±1 | 46 | 1 | 98% | 63% | 83% |
| Loose, without the year | 47 | 1 | 98% | 65% | 85% |

The single wrong match in the rules with a track count is Trust's *Idéal* (1983). MusicBrainz has two 1983 Trust albums, *Idéal* and *Trust IV*. Wikidata labels the item *Trust IV*; Apple's title is *Idéal*. Without the track count, both albums pass, and the link goes to confirmation instead.

**What the right album's releases fail.** These are the 51 labelled links whose right album the search found:

| Criterion | No release of the right album matches it |
| --- | --- |
| Title, exactly | 10 (20%) |
| Title, with edition notes dropped | 2 (4%) |
| Artist credit, exactly | 4 (8%) |
| Track count | 7 (14%) |
| Release date | 8 (16%) |
| Release year or the album's original year | 1 (2%) |

Apple's release date is often the album's *original* date even for a reissue: *Bleach (Deluxe Edition)* is dated 15 June 1989, its first release. So comparing with the release group's first year rescues reissues without loosening anything else.

## Proposed rule (TS-41 step 4)

1. **Search** MusicBrainz releases by title and first artist:
   - The title is cleaned first: drop Apple's " - EP" and " - Single", trailing notes such as "(Deluxe Edition)" or "[2018 Remaster]", and "(feat. …)", which MusicBrainz credits as an artist.
   - If that finds nothing, search by title alone. That was needed for 13 of 81 links, for example a transliterated artist: Apple's "Mumiy Troll" for Мумий Тролль.
   - Then look up the candidates' release groups for their first-release dates.
2. **Title:** the cleaned titles agree on letters and digits, after case and accent folding (`searchKey`). "I miei ricordi...." and "I miei ricordi..." agree.
3. **Artist:** Apple's artist, or its first credited artist, equals one of the release's credited names, artist names or sort names, compared on letters and digits.
   - Sort names carry Latin forms, such as "Mumiy Troll'" for Мумий Тролль.
   - A sort name like "Celeste, Gianni" is also tried as "Gianni Celeste".
4. **Year:** Apple's year equals the release's year or its release group's first year.
5. **No track count.**
6. **Accept** when exactly one release group passes. Several albums go to confirmation (TS-26). None passes to step 5, manual entry, prefilled with the hints.

## What fails

- **No hints (18 links).** iTunes Lookup doesn't have the album in the storefronts tried. That's a sampling artifact here, except for albums removed from Apple Music.
- **The search doesn't find the right album (3 links with hints):**
  - classical credits: "Berlin Philharmonic" against "Berliner Philharmoniker";
  - *Idéal* against *Trust IV*;
  - a live title whose note isn't an edition note: *En tournée (L'heptade Live)*.

  MusicBrainz's search results carry sort names but not aliases. Matching aliases, which would fix the classical case, would cost an artist lookup per candidate.
- **The right album is found, but no rule accepts it:**
  - a year that disagrees: *I miei ricordi....*, dated 2005 by Apple;
  - an artist name that matches none of MusicBrainz's names or sort names for the artist:
    - *שמחת חינם*, where Apple writes the artist in Latin letters, "Bar Tzabari";
    - *Cançons de la Veritat Oculta*, whose "(feat. …)" the loose title already drops;
  - two albums of the same name: *Iowa*.

## Cost

- **Per link that reaches step 4:**
  - one iTunes Lookup call, or two or three when the link's storefront lacks the album;
  - two MusicBrainz requests: the release search and the release-group dates;
  - a third MusicBrainz request for the title-only search in 16% of links.
- **iTunes Lookup is the tighter limit.** Apple documents about 20 calls a minute, so a batch of 50 Apple links that all reach step 4 needs at least 2.5 minutes of iTunes calls. MusicBrainz's queue runs alongside. Batches enrich progressively (TS-41), so this delays the batch but doesn't block it.
- **This run:** 214 MusicBrainz requests and 100 iTunes calls for 81 links, across both runs. MusicBrainz answered 503 often enough that one link failed after five retries and needed the second, cached run.

## What this changes elsewhere

- **TS-41 step 4:** the rule above replaces "exactly one release matches the normalized title, artist credit, track count, and release date or year".
- **TS-41 step 2 and TON-14:** with album identity, several releases in one release group are one album, so *confident* rather than `needs_input`. In TON-14 that would turn *BRAT* (Qobuz) and Kind of Blue (Spotify, in the smoke test) into identified albums.
- **The PRD, G2 (TON-18) and TS-44:** edition matching, edition labels and same-edition conflicts (FR-01.7, FR-02.7, FR-02.9, FR-14.3, FR-14.4, AC-09) follow from the creator's album-identity decision. They are recorded separately: this spike only measures step 4.
- **Retention:** whether Apple's hints may be stored, shown through MCP or exported is still TON-17's question.
  - `results.json` keeps Apple's numbers (date, track count) but not its titles or artist names.
  - Names in this report come from MusicBrainz, which is CC0, except the few quoted from the creator's own links and failure cases.

## Running it again

```sh
bun tooling/src/spikes/g1-apple-hints/sample.ts   # rebuilds links.txt and labels.json
bun tooling/src/spikes/g1-apple-hints/run.ts tooling/fixtures/g1-apple/links.txt --cache
```

- `--cache` keeps MusicBrainz and iTunes responses in `cache/`, which is gitignored.
- The generated tables are in `tooling/fixtures/g1-apple/report.md`.
- The harness reuses TON-14's MusicBrainz client and link parser.
