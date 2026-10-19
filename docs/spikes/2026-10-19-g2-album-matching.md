# Tonaris — G2 spike: album matching, 19 October 2026

Spike for [TON-18](https://linear.app/zunhdev/issue/TON-18). It validates the evidence rules of [TS-44](../tech-spec.md) on a corpus built from MusicBrainz:

- **Editions:** links to any edition of an album must land on that album, the MusicBrainz release group (FR-02.12). That covers remasters, deluxe editions, regional releases and reissues.
- **Same titles:** different albums with the same title must stay apart.
- **Similarity:** title-and-artist similarity alone must never merge two albums (FR-02.9).

Restore conflicts (FR-14.3) use the same identity, so they follow from the same results.

## Verdict

**TS-44 holds. Identifying the album by its MusicBrainz release group errs only by keeping one album twice, never by merging two.**

- **Same titles stay apart.** The corpus has 85 groups of an artist's albums that share a title, 243 pairs in all. Keeping release groups apart was right for 228 pairs and never merged two different albums. Examples:
  - Weezer's seven *Weezer*s;
  - Peter Gabriel's four albums called *Peter Gabriel*, and a set of two of them;
  - Taylor Swift's re-recordings (*Taylor's Version*);
  - The Animals' different UK and US albums;
  - EPs of an album's songs;
  - live albums named after studio albums.
- **The errors are splits.** 15 pairs, in 13 groups, are one album that MusicBrainz keeps under two release groups:
  - editions that got their own release group, such as *Nevermind (30th Anniversary Super Deluxe)*;
  - the same release entered twice;
  - a compilation's US and European editions.

  Tonaris would keep two records for these. That is the safe failure: a person can delete one, while a wrong merge would lose an album silently.
- **Similarity would be wrong almost everywhere.** Matching on title and artist would merge different albums in **74 of the 85 groups** (228 of 243 pairs). "Never a match" stays.
- **Editions land on their album.** 176 edition links were identified without MusicBrainz's URL relationships, through Spotify's UPC, a numeric Qobuz id, or Apple's hints. These covered deluxe, remastered, anniversary, expanded, reissued and regional editions.
  - Of the 128 that found something, **125 found their album and none found a wrong one.**
  - The other **3 went to confirmation**, each because a promotional EP, a bootleg or a single shares the album's title. TON-16's two ambiguous links were the same pattern.
- **Step 2 is unambiguous.** MusicBrainz relates each of the 580 edition links it knows to exactly one album.
- **Two new rules are needed.**
  - **Release group ids change.** MusicBrainz merges and deletes release groups. In this corpus, one album's id had been merged into another, and one had been deleted. Matching must compare current ids.
  - **Step 4 should search only official releases, and skip singles** unless Apple's title says " - Single". That would have resolved all five ambiguous step 4 results in TON-16 and here.
- **Decided during the spike: a track link from a single adds the single** (FR-02.3). The rule already said so for compilations, and the single is saved as Unclassified.

## Corpus

The corpus is in [`tooling/fixtures/g2-matching/`](../../tooling/fixtures/g2-matching/), built by [`build.ts`](../../tooling/src/spikes/g2-matching/build.ts):

- **Albums.** The 141 albums the G1 samples labelled or identified (TON-14, TON-15, TON-16).
  - One of them no longer exists: the Wikidata label points at a release group MusicBrainz deleted.
  - Seven artists were added for known hard cases: Weezer, Peter Gabriel, Taylor Swift, Kraftwerk, Slipknot, Trust and Nirvana.
- **Editions.** Every release of those albums with a Spotify, Apple Music or Qobuz link: 453 releases, 751 links. Each release is classed by its title, disambiguation, date and country against the album's first release:

  | Kind | Releases |
  | --- | --- |
  | Reissue (later than the first release) | 222 |
  | Original | 144 |
  | Regional (another country) | 143 |
  | Deluxe | 82 |
  | Expanded, bonus or special | 25 |
  | Remaster | 16 |
  | Anniversary | 9 |

  A release can be several kinds at once.
- **Same titles.** Each artist's official albums and EPs, grouped by title once edition notes like "(Deluxe Edition)" are dropped: 136 artists, 85 groups, 243 pairs.
  - Five artists with more than 300 official albums were left out: the Berliner Philharmoniker (1,437), Elvis Presley (1,013), Ella Fitzgerald (691), Miles Davis (626) and John Coltrane (451).

**How pairs were judged.** Whether two same-title release groups are one album depends on their earliest official releases' track lists, compared on letters and digits:

1. Most of the longer track list (90%) in common: **one album**, re-released or entered twice.
2. An EP or single whose songs are all on an album: **a different release**.
3. A release holding the whole of an earlier or same-year album: **that album's edition**. This doesn't apply when the album held is itself a compilation, because big best-ofs hold the hits of small ones.
4. Anything else, and any live, remix or soundtrack album paired with another type: **different albums**.

23 pairs were judged by hand against their track lists ([`verdicts.ts`](../../tooling/src/spikes/g2-matching/verdicts.ts)): the 17 that titles, years and types alone flagged, and the 6 that rule 3 called editions. The other 220 follow the rules:
- 190 share too few tracks;
- 11 pair a live, remix or soundtrack album with another type;
- 9 are EPs of an album's songs;
- 7 share their track list;
- 3 had no track list to compare.

## Same-title albums

| Rule | Right | Wrong | How it fails |
| --- | --- | --- | --- |
| Release group (TS-44) | 228 | 15 | Keeps one album twice |
| Title and artist | 15 | 228 | Merges different albums |

**One album under two release groups** (the 15 splits):

| Kind | Albums |
| --- | --- |
| An edition with its own release group | *Nevermind* and its 30th-anniversary super deluxe, typed as a compilation; Fra Lippo Lippi's *Songs* and its 2005 reissue; Brel's *Ces gens-là*, 10-inch and 12-inch; *The Animals with Sonny Boy Williamson*, 1975 and 1992; The Who's *Live at the Fillmore East 1968*, 1989 and 2018 |
| One release entered twice | Trust's *Le Best-Of* and *Le Best of*; Garden City Movement's *Entertainment* EP; Maroon 5's *Stagg Street Recordings*, as album and as EP; Jacques Dutronc's *Le meilleur de Jacques Dutronc*; Jacques Brel's *Greatest Hits*, three times; *The Who Collection*; *The Best of The Animals* |
| A compilation's regional editions | Gloria Estefan's *Oye mi canto*, US and Europe, three tracks swapped |

Title grouping can't find a split whose titles differ. One was checked by hand: Trust's *Trust IV* and *Idéal* have identical track lists, under two release groups, and there is also a single called *Idéal*. Nor does it reach the five artists left out: TON-16's *Tchaikovsky: The Nutcracker (Remastered 2026)*, a 2026 remaster with its own release group, is a Berliner Philharmoniker release. Translated titles are grouped well, though: Kraftwerk's *Die Mensch·Maschine*, *The Man-Machine* and the Argentine *La máquina humana* are one release group.

**Different albums kept apart**, which similarity would merge:
- Weezer's seven *Weezer*s (21 pairs);
- Peter Gabriel's four, and *Car / Scratch*, a set of the first two;
- four *Taylor's Version* re-recordings;
- The Animals' UK and US *The Animals* and *Animal Tracks*;
- 10 EPs of an album's songs, such as Kate Bush's Record Store Day *Hounds of Love* EP;
- 11 pairs of a live, remix or soundtrack album and another album of the same title;
- best-ofs that share a title but not a track list.

## Edition links through steps 3 and 4

Selected links: for each album, the editions furthest from the first release, at most one link per service and two per album, and at most 80 Spotify, 60 Apple Music and 40 Qobuz links overall. Each was identified as if MusicBrainz didn't know the link:
- Spotify through its UPC (TS-41 step 3, [TON-15](2026-10-19-g1-spotify-bridge.md));
- Qobuz through a numeric id treated as a barcode (step 3, TON-14);
- Apple through its hints and TON-16's recommended rule (step 4, [TON-16](2026-10-19-g1-apple-hints.md)).

| Service | Links | Right album | Wrong album | Several albums | None | No bridge |
| --- | --- | --- | --- | --- | --- | --- |
| Spotify | 80 | 74 | 0 | 0 | 6 | — |
| Qobuz | 36 | 12 | 0 | 0 | 8 | 16 (alphanumeric ids) |
| Apple Music | 60 | 39 | 0 | 3 | 18 | — |

| Edition kind | Links | Right album | Several albums | None or no bridge |
| --- | --- | --- | --- | --- |
| Deluxe | 23 | 12 | 2 | 9 |
| Remaster | 9 | 8 | 0 | 1 |
| Anniversary | 2 | 1 | 0 | 1 |
| Expanded | 8 | 7 | 0 | 1 |
| Reissue | 67 | 50 | 2 | 15 |
| Regional | 28 | 22 | 0 | 6 |
| Original | 88 | 61 | 1 | 26 |

- **No edition went to a wrong album, and none went to the other release group of a split.** Deluxe and remastered editions reach the album because the UPC finds that edition's own release, and Apple's hints are compared with the album's first year (TON-16).
- **"None" is coverage, not matching.** MusicBrainz lacks that edition's barcode, or the hints find nothing. Those links go to manual entry, as in TON-15 and TON-16.
- **One apparent wrong album was a merge.** Pop Smoke's *Shoot for the Stars Aim for the Moon* deluxe edition found release group `d6d1de65…`. The corpus expected `fcd3637b…`, which MusicBrainz has since merged into it.

**What sent the three to confirmation:**

| Link | Album | Also found |
| --- | --- | --- |
| Apple, *Rebel Heart* (deluxe) | Madonna, *Rebel Heart* | A promotional *Rebel Heart* EP |
| Apple, *Iowa* (deluxe) | Slipknot, *Iowa* | A bootleg remix album called *Iowa* |
| Apple, *Cuts Both Ways* | Gloria Estefan, *Cuts Both Ways* | The *Cuts Both Ways* single |

TON-16's two ambiguous links were the same: the same bootleg *Iowa*, and Trust's *Idéal* single next to the album *Idéal*. Restricting step 4's search to official releases, and to albums and EPs unless Apple's title says " - Single", would have identified all five. *Idéal* would then land on the album's other release group, which is a split.

## Release group ids change

MusicBrainz merges duplicate release groups and deletes empty ones. Among the 141 albums, one id had been merged and one deleted:

- **A merged id still works.** A lookup of a merged id returns the release group it now belongs to, under its new id. A link captured after the merge resolves to the new id, so a saved album with the old id wouldn't match it, and Tonaris would keep the album twice.
- **A deleted id answers 404.**

**Proposed for TS-44, to decide in TON-25:**
- When MusicBrainz answers a lookup of a stored `mb_release_group_id` with another id, enrichment replaces the stored one.
- Matching also compares a new link's album with saved albums whose stored id has since been merged into it.
- A deleted release group leaves the album as it is, with its data, but no longer identified.

## Track links

The decision on singles (FR-02.3) rests on TON-15's 30 Spotify track links. Of those, 17 identified an album:
- 13 landed on albums, 1 on a soundtrack and 1 on a compilation;
- 2 landed on singles: Sarah's *Mappamondo*, whose song later also appeared on her EP *Sarah*, and Giorgia's *La cura per me*.

**Decided on 19 October 2026:** a track link adds the release it belongs to, including a single. The single is saved as Unclassified (FR-05.9).

## Limits

- **Notable albums.** Wikidata favors them, and they have more editions, reissues and namesakes. That makes the corpus harder than an average collection, not easier.
- **Prolific artists were left out.** Five artists with more than 300 official albums were skipped. Same titles are commonest there: a hundred recordings of *The Nutcracker* are a hundred albums. Release groups keep recordings apart, which is right, but the corpus doesn't test it.
- **Judgement is involved.** Whether a reissued best-of with two more tracks is "the same album" is a judgement. The rules and verdicts are written down, and a different call would move a few pairs between "split" and "right", not into "merged".

## What this changes elsewhere

- **TS-44.**
  - The evidence table is validated.
  - The splits found are listed, and track links follow FR-02.3.
  - The rule for changed release group ids is proposed for TON-25.
- **TS-41 step 4.** The search should cover official releases only, and skip singles unless Apple's title says " - Single" (proposed for TON-25).
- **PRD.** FR-02.3 now says a track from a single adds the single, with a change-log entry.

## Running it again

```sh
bun tooling/src/spikes/g2-matching/build.ts            # corpus.json and review.md, with a MusicBrainz cache
bun tooling/src/spikes/g2-matching/run.ts              # results.json and report.md; about 30 minutes
bun tooling/src/spikes/g2-matching/run.ts --rescore    # scores the last run again after verdicts change
```

- `run.ts` needs the Spotify credentials in the repository root's `.env`, like TON-15.
- It caches nothing, because the Spotify bridge's lookups carry UPCs (TS-41).
- The generated tables are in `tooling/fixtures/g2-matching/report.md`.
