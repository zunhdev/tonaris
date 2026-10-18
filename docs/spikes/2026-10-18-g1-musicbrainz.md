# Tonaris — G1 spike: the MusicBrainz identification chain, 18 October 2026

Spike for [TON-14](https://linear.app/zunhdev/issue/TON-14). It measures how far the first steps of the [TS-41](../tech-spec.md) resolver chain get on real links:

1. existing link;
2. MusicBrainz URL lookup;
3. the barcode bridge for Qobuz numeric ids.

It also measures what enrichment gets from each identified release: TS-45 classification, the original year, Cover Art Archive artwork, and TS-46 recording dates.

It informs the creator's G1 decision, which TON-25 records. Spotify's identifier bridge is TON-15 and Apple's iTunes Lookup hints are TON-16; links that would need them stop here as *pending*.

## Verdict

**MusicBrainz works as the canonical source, but step 2 as TS-41 writes it is too narrow.**

- **Step 2 needs more URL forms.** MusicBrainz stores each URL in the form its editor pasted: any Apple storefront, Qobuz store URLs with a slug and any locale.
  - On the creator's links, the canonical URL alone identified **2 of 15**.
  - Asking for all stored forms in the same single request identified **5**, and found several releases for a 6th.
- **The Qobuz barcode bridge needs the UPC-A form.** It found nothing with the 13-digit id as written. Every barcode hit came from the 12-digit UPC-A, the id without its leading 0.
- **Most misses are missing links, not missing albums.** MusicBrainz had the album for most of the creator's misses, so steps 3 and 4 (TON-15, TON-16) carry real weight.
- **Enrichment is reliable once a release is found:**
  - original year 100%;
  - Cover Art Archive front 97%;
  - barcode 90%.

  Recording dates for live albums are unproven: the one live release identified had none.
- **Batch latency:** 50 links took 66 s at 1 request per second, which confirms progressive enrichment (TS-41). MusicBrainz also answers 503 "busy" at times, even well under 1 request per second, so retries with backoff are mandatory.

## Sample

The issue asked for about 150 of the creator's links. The creator provided **15**: 6 Apple Music, 5 Qobuz and 4 Spotify, all album links. Several albums appear on more than one service.

Fifteen links can't give stable per-service rates, so a **supplementary sample of 69 links** was drawn from Wikidata. Wikidata records Spotify (P2205), Apple Music (P2281) and Qobuz (P11770) album ids apart from MusicBrainz ([`sample-wikidata.ts`](../../tooling/src/spikes/g1-musicbrainz/sample-wikidata.ts)). For each service the sample has two strata:

- **in MB:** 15 albums that Wikidata links to a MusicBrainz release group (P436). This measures how often MusicBrainz has *the service link* when it has the album.
- **not in MB:** up to 10 albums with no such link. This shows the coverage gap; Qobuz had only 4 in the slice.

Wikidata favors notable albums, and some of its ids came from MusicBrainz, so the supplementary sample flatters MusicBrainz. The creator's links are the real test.

Everything is committed in [`tooling/fixtures/g1-sample/`](../../tooling/fixtures/g1-sample/):

- `links.txt`, the sample;
- `results.json`, every attempt and request;
- `report.md`, the generated tables this report quotes.

## Hit rates

*As written* uses only the link's canonical URL in step 2 and the 13-digit id in step 3. *With the refinements* adds the other stored URL forms and the UPC-A barcode form (see [Proposed changes](#proposed-changes)).

| Sample | Links | TS-41 as written | With the refinements | Several releases | Pending (TON-15/16) | Unresolved |
| --- | --- | --- | --- | --- | --- | --- |
| **Creator** | 15 | 2 (13%) | 5 (33%) | 1 | 6 | 3 |
| Spotify, in MB | 15 | 6 (40%) | 6 (40%) | 0 | 9 | 0 |
| Apple Music, in MB | 15 | 4 (27%) | 8 (53%) | 0 | 7 | 0 |
| Qobuz, in MB | 15 | 3 (20%) | 10 (67%) | 0 | 0 | 5 |
| Spotify, not in MB | 10 | 0 | 0 | 0 | 10 | 0 |
| Apple Music, not in MB | 10 | 0 | 0 | 0 | 10 | 0 |
| Qobuz, not in MB | 4 | 1 | 1 | 0 | 0 | 3 |

**The creator's links per service:**

| Service | Links | Canonical URL | Another stored form | Several releases | Pending | Unresolved |
| --- | --- | --- | --- | --- | --- | --- |
| Spotify | 4 | 2 | 0 | 0 | 2 (TON-15) | 0 |
| Apple Music | 6 | 0 | 2 (`se`, `fr` storefronts for `fi` links) | 0 | 4 (TON-16) | 0 |
| Qobuz | 5 | 0 | 1 (store URL with slug) | 1 (store URL with slug) | 0 | 3 |

**By step:**

- **Step 1, existing link:** no hits. Nothing in the sample repeats; in real use it depends on how often people paste an album again.
- **Step 2, URL lookup:** all the hits above except the 4 barcode hits.
  - MusicBrainz takes many `resource` parameters in one request and answers with the ones it knows, so the extra forms cost no extra requests.
  - The stored forms that matched:
    - Spotify: always `open.spotify.com/album/{id}`.
    - Apple: the link's own storefront 4 times, otherwise `gb` (3), `se`, `fr` and `de`.
    - Qobuz: `open.qobuz.com/album/{id}` (4), `www.qobuz.com/us-en/…` (3), the locale-less `www.qobuz.com/album/{slug}/{id}`, `gb-en` and `ca-en`.
- **Step 3, Qobuz barcode bridge:** 10 Qobuz links had 13-digit numeric ids, and 14 had letters and digits, which no bridge can use.
  - Of the 10 numeric ones, 3 were found by URL and 4 by barcode.
  - All 4 matched only the 12-digit UPC-A, never the 13-digit EAN as stored by Qobuz.
  - Only 1 of the creator's 5 Qobuz ids was numeric, and MusicBrainz had neither of its barcode forms.

**Why the creator's links missed.** These albums were checked by hand with MusicBrainz release-group searches:

| Link | Album | In MusicBrainz? | Why it missed |
| --- | --- | --- | --- |
| Apple `669728060` | Nirvana, *Bleach (Deluxe Edition)* | Yes, and the Qobuz link to the same edition matched | This Apple id isn't linked |
| Apple `869027888` | Мумий Тролль, *Икра (Deluxe)* | Yes, *Икра* (1997); the Spotify link matched | The deluxe edition's Apple id isn't linked |
| Apple `679710399` | FKA twigs, *EP2* | Yes (2013) | This Apple id isn't linked |
| Apple `6809480000` | *Tchaikovsky: The Nutcracker (Remastered 2026)*, Rostropovich | Yes; the release group exists, released 9 October 2026 | Too new: the Apple link isn't added yet |
| Qobuz `c6zb0r5qcrqoa` | Мумий Тролль, *Икра* | Yes | The Qobuz link isn't linked; its slug is `-` (no Latin letters) |
| Qobuz `z96u0k0znz1xb` | *Tchaikovsky: Nutcracker*, Rattle and the Berliner Philharmoniker | Not checked: MusicBrainz was busy | — |
| Qobuz `0884977423006` | The Jimi Hendrix Experience, *Are You Experienced* | Yes, other editions; no release with this barcode | This edition isn't in MusicBrainz |
| Spotify ×2 | Not looked up: Spotify data stays out of the chain (TS-41) | — | TON-15 runs these through the Spotify bridge |

So at least 5 of the 7 checked misses are albums MusicBrainz already has, under another edition or without this service's link. The Wikidata "in MB" strata agree: even when MusicBrainz has the album, it lacks the service link 33–60% of the time. Steps 3 and 4 decide whether those links can be identified automatically.

**Several releases.** The creator's Qobuz link to *BRAT* (Charli xcx) matched 2 releases with the same barcode and different dates. In the harness's smoke test, Kind of Blue's Spotify URL matched 2 releases too. TS-41 sends these to `needs_input`. Whether "same barcode, same release group" could count as confident is a G2 question for TON-18. The candidates' barcodes, dates and countries are recorded in `results.json`.

## Enrichment

Each of the 30 identified releases was looked up once with `inc=release-groups artist-credits recordings recording-level-rels place-rels area-rels event-rels`. That one request carries everything below.

| Measure | Result |
| --- | --- |
| Original year (release group's `first-release-date`) | 30 of 30 |
| Barcode | 27 of 30 |
| Cover Art Archive front for the release (`cover-art-archive.front`) | 29 of 30; the 30th has a front on its release group |
| TS-45 classification | Album 29, Compilation 1; no EP or Unclassified |
| Live (secondary type `Live`) | 1: *Magic Boy: The Jimi Hendrix Experience Live at Berkeley*, released 16 October 2026 |
| TS-46 recording dates for live releases | None on that release's 11 recordings |

- **Recording dates are unproven.** The one live release identified was two days old, and its recordings had no "recorded at" relationships yet. A spot check during development, of *The Köln Concert*, showed both kinds of dating:
  - some recordings carry the dates on the "recorded at" place relationship;
  - others have them only on the *event* they were recorded at, in the event's `life-span`.

  TS-46 should fall back to the event's dates. Live coverage needs a targeted sample; TON-18's corpus is the natural place for it.
- **New releases are covered quickly.** The creator's *Dopamine Chamber* (Fontaines D.C.), released 15 October, was already in MusicBrainz with an Apple link. *Magic Boy* (16 October) was too.

## Latency at 1 request per second

The first 50 links of the batch, uncached, through one queue paced at 1 request per second start to start:

| Measure | Result |
| --- | --- |
| Batch done (every link decided, identified ones enriched) | 66 s |
| MusicBrainz requests | 69, or 1.38 per link: a URL lookup for each, a barcode search for numeric Qobuz ids, and a release lookup for each identified release |
| Identified links, after batch start: p50 / p95 | 32 s / 65 s |
| MusicBrainz response time: p50 / p95 | 99 / 354 ms |
| Retries after a 503 | 0 in this run |

- **The queue sets the pace.** A 50-link paste takes about a minute at 1 request per second, and longer once step 3 and 4 requests are added. This confirms TS-41's pending enrichment state and progressive batches.
- **MusicBrainz is sometimes busy.** The batch run saw no 503s. During development, though, MusicBrainz answered 503 ("The MusicBrainz web server is currently busy") several times, even with 2–8 s between requests. Its 503s are about server load as well as client rate.
  - The queue must honour `Retry-After` and back off.
  - A job must survive minutes of 503s without failing the capture.
- **Store lookups don't touch MusicBrainz's limit.** The Qobuz slug lookup (below) goes to www.qobuz.com, outside MusicBrainz's queue. It took one request per `open.qobuz.com` link.

## Proposed changes

These are for the creator to decide in TON-25, together with TON-15 to TON-17.

1. **TS-41 step 2 asks for every stored form in one request:**
   - the canonical URL;
   - for Apple, the album under the common storefronts;
   - for Qobuz, `open.`, `play.`, the locale-less store URL and the store URL under the common locales.

   It costs no extra MusicBrainz requests.
2. **Qobuz slug lookup (TS-40, TS-103).** `open.qobuz.com` links lack the store slug that MusicBrainz's store URLs include.
   - One `GET https://www.qobuz.com/us-en/album/-/{id}` with `redirect: manual` answers 301 with the slugged URL. A title with no Latin letters answers 200 with the slug `-`.
   - This would be a second kind of network resolution beside short links, to an allowlisted host through the SSRF guard. TON-17 should check it against Qobuz's terms.
   - Without it, 5 Qobuz links found only through store URLs would have missed, 2 of them the creator's.
3. **TS-41 step 3 tries the UPC-A form.** It looks for the 13-digit id and the id without its leading 0, in one search (`barcode:… OR barcode:…`), and keeps only exact barcode matches.
4. **TS-46 falls back to the event's dates.** When a recording has no dated "recorded at/in" relationship, it uses the `life-span` of the event it was recorded at.
5. **TS-41 rate limiting.** It should say that 503 means "retry later", whatever caused it, and that the job retries with backoff rather than failing.

## Running it again

```sh
bun tooling/src/spikes/g1-musicbrainz/run.ts tooling/fixtures/g1-sample/links.txt --cache
```

- The tool writes `results.json` and `report.md` next to the links file.
- `--cache` keeps MusicBrainz responses in `cache/` there (gitignored), so the report can be rebuilt without new requests. Start from an empty cache for latency.
- `--interval <ms>` changes the pacing.
- The spike code in [`tooling/src/spikes/g1-musicbrainz/`](../../tooling/src/spikes/g1-musicbrainz/) is a measurement harness, not the production client:
  - its link parser can inform TON-39;
  - its client and chain can inform TON-41 and TON-42.
