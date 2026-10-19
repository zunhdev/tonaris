# Tonaris — G1 spike: Spotify's identifier bridge, 19 October 2026

Spike for [TON-15](https://linear.app/zunhdev/issue/TON-15). It measures step 3 of the [TS-41](../tech-spec.md) resolver chain for Spotify:

- a Spotify app in development mode, owned by the creator's Premium account, gets a token with client credentials;
- `Get Album` yields the album's UPC (`external_ids.upc`), and `Get Track` yields the album a track link belongs to;
- a MusicBrainz barcode search turns the UPC into an album.

The questions are whether this works in development mode, what it costs, and how often it identifies the right album. As in [TON-16](2026-10-19-g1-apple-hints.md), outcomes are scored on the **album**, the MusicBrainz release group (FR-02.12). Spotify values stay in memory, as TS-41 requires: nothing the harness writes holds a UPC or a parent album id.

## Verdict

**The bridge is viable, and it is the most precise step after the URL lookup.**

- **Development mode works.** Client credentials, `Get Album` and `Get Track` all work, and every one of 241 API calls succeeded, with no 429 and no 404. Spotify removed the batch endpoints in February 2026 ([migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)): `GET /albums?ids=` answers 403, so each link costs its own calls.
- **Every album has a UPC.** All 109 links' albums had `external_ids.upc`: 47 as 12 digits, 35 as 13 and 27 as 14. Spotify restored the field in March 2026 after removing it in February ([changelog](https://developer.spotify.com/documentation/web-api/references/changes/march-2026)).
- **Every track link names its album.** `Get Track` gave the parent album for all 30 track links, as FR-02.3 asks: the album of the release that link belongs to.
- **The hit rate.** Step 3 identifies 60 of the 109 links (55%). With step 2 first, the chain identifies **63 (58%)**, against 40 (37%) for step 2 alone.
  - On the 66 albums labelled by Wikidata or by hand, steps 2–3 find **42 (64%)**, against 24 (36%) for step 2 alone.
  - Among the links step 2 misses, step 3 finds 23 of 69 (33%), and 18 of the 42 labelled ones (43%).
- **No wrong album.**
  - One match disagrees with its label, and it is the same album: MusicBrainz keeps Trust's 2008 compilation under two release groups, *Le Best-Of* (Wikidata's) and *Le Best of* (one digital release with Spotify's barcode).
  - When steps 2 and 3 both find one album, they agree on all 37 links.
  - The unlabelled matches checked by hand are right: the creator's *Nutcracker*, *Talents Fâchés Vol. 4* and three track links.

  With no error in 55 labelled matches, the error rate is plausibly below about 5% (the rule of three, 3/55).
- **Album identity removes the ambiguity.** 13 matches found 2–4 releases, always of one album. Release-level identity would have sent all 13 to confirmation; here none needed it.
- **The creator's links:** 3 of 4 are identified.
  - Step 2 finds *Bleach* and *Икра*.
  - Step 3 alone finds *Tchaikovsky: The Nutcracker*: the Bergen Philharmonic under Neeme Järvi (Chandos, 2014), through MusicBrainz's 24-track digital release.
  - *Are You Experienced* stays unidentified. MusicBrainz has 56 releases of it, 44 with barcodes, but not this edition's.
- **One rule changes:** search the barcode in **all three forms**, 12, 13 and 14 digits. Spotify writes some UPC-As as GTIN-14s with two leading zeros, and MusicBrainz editors importing from Spotify copy them as they are. In the first run, 5 links missed because only the 12- and 13-digit forms were searched.

## Sample

There are 109 Spotify links in [`tooling/fixtures/g1-spotify/`](../../tooling/fixtures/g1-spotify/), drawn by [`sample.ts`](../../tooling/src/spikes/g1-spotify/sample.ts):

| Sample | Links | Labelled | Step 2: one album | Step 3: one album | Steps 2–3: one album |
| --- | --- | --- | --- | --- | --- |
| The creator's album links | 4 | 1 (+2 by step 2) | 2 | 3 | 3 (75%) |
| Wikidata albums with a MusicBrainz release group (the TON-14 stratum) | 15 | 15 | 6 | 9 | 9 (60%) |
| Wikidata albums without one (unlabelled) | 10 | 0 | 0 | 1 | 1 (10%) |
| Wikidata albums with a MusicBrainz release group (new) | 50 | 50 | 18 | 31 | 33 (66%) |
| Wikidata track links (P2207) | 30 | 0 (14 by step 2) | 14 | 16 | 17 (57%) |

- **Labels** give each album link's true album: Wikidata's P436, or a manual MusicBrainz search for *Are You Experienced*. Links step 2 knows are also labelled with the album it finds.
- **The creator's *Nutcracker*** names no performer on its public page's summary, so it was checked by hand after the run.
- **Track links have no Wikidata label.** What a track link should identify is the album of the release it belongs to, which only Spotify knows. They are scored against step 2 on that album, where MusicBrainz knows it.
- **The unlabelled album stratum** checks for false positives. Its one match, *Talents Fâchés Vol. 4*, is right; Wikidata's item is the series, which has no release group.
- **Wikidata favors notable albums**, and some of its Spotify ids came from MusicBrainz, so coverage here is likely better than for an average collection. All 109 ids still resolved on Spotify.

## Precision and recall

| Truth | Links | Step 3 right | Step 3 wrong | Step 3 recall | Steps 2–3 recall |
| --- | --- | --- | --- | --- | --- |
| Wikidata or manual label | 66 | 39 | 1 (the MusicBrainz duplicate) | 59% | 62% (64% with the duplicate) |
| Step 2's album (links with no other label) | 16 | 15 | 0 | 94% | 100% |

Step 2 alone is right on 24 of the 66 labelled links and never wrong.

## What fails

Step 3 ends without an album for 49 links. Spotify always gave a UPC, so every miss is MusicBrainz not having it:

| Why | Links |
| --- | --- |
| MusicBrainz has the album, but its releases carry other barcodes | 17 |
| MusicBrainz has the album, but none of its releases has a barcode | 10 |
| Unlabelled: whether MusicBrainz has the album at all is unknown (9 albums from the unlabelled stratum, 13 track links) | 22 |

- **Digital editions are the gap.** 10 of the 27 labelled misses have no digital release in MusicBrainz at all, only physical ones. The Spotify edition's barcode is usually its own.
- **What could close it:** contributing those releases to MusicBrainz, or a later alias or recording lookup. Spotify's titles and artists may not be used as hints (TS-41), so a miss goes to manual entry with nothing prefilled but the link.
- **ISRCs don't help with albums.** `Get Track` also gives the track's ISRC. A MusicBrainz ISRC lookup finds the *recording*, which appears on many albums, so it can't say which album a track link belongs to. It wasn't pursued.

## Track links

- **Two calls each.** `Get Track` names the album, but the album object it embeds has no `external_ids`, so `Get Album` follows.
- **They land where the link was shared from.** Of the 17 identified track links:
  - 13 landed on albums, 1 on a soundtrack and 1 on a compilation (Dalida's *Volume 9*);
  - 2 landed on **singles**: *Mappamondo* and *La cura per me*.

  That is FR-02.3's rule, the album of the release the link belongs to. But a track shared from a single adds the single, which TS-45 leaves Unclassified. G2 (TON-18) covers track links and should include this case.

## Cost and limits

- **Calls per link:** one `Get Album` for an album link, two calls for a track link, and a token every hour (`expires_in` 3,600 s; it took 117 ms). A batch of 50 links costs 50–100 calls.
- **Latency outside MusicBrainz's queue:**
  - `Get Album`: p50 116 ms, p95 324 ms;
  - `Get Track`: p50 134 ms, p95 375 ms.
- **MusicBrainz, for identification:** one URL lookup (step 2), plus one barcode search when step 2 misses. The harness's 285 requests also include a release lookup to name step 2's album, and a browse of the right album's releases for each miss.
- **No throttling observed.**
  - The whole run made 141 calls, paced at least 250 ms apart and in practice by MusicBrainz's queue.
  - A burst of 100 `Get Album` calls back to back took 16 seconds; all of them succeeded.
  - Spotify publishes no development-mode numbers. It counts calls in a rolling 30-second window ([rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)), and since July 2026 per developer account: every development-mode app the creator owns draws on one quota ([changelog](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)). A 429 carries `Retry-After`, and its body says `QUOTA_EXCEEDED` when the quota, not the rate, ran out. The client handles both.
- **MusicBrainz was the unreliable side.**
  - It answered 503 to 16 of the first full run's links. The 503s come from its *global* limit (`x-ratelimit-zone: global`), not the 1 request per second per IP, and say `Retry-After: 0`.
  - TON-14's client trusted that header and spent its retries in seconds. It now backs off exponentially with the header as a floor, and one link's rerun cleared the last error.
  - The production queue (TS-90) needs the same rule.

## Keeping Spotify values in memory

The harness keeps nothing: results record whether a UPC or a parent album was found and how many digits the UPC has, and nothing is cached. Building it still showed three places where production code would leak a Spotify value without meaning to:

1. **The MusicBrainz cache.** TS-41 caches MusicBrainz for 7 days "keyed by URL, barcode, and MBID". A barcode search for a Spotify UPC, or a URL lookup for a track link's parent album, would make a Spotify value the cache key. On a hit, the key is MusicBrainz's own barcode or URL, which is CC0. On a miss, it is Spotify's alone.
2. **Errors and logs.** MusicBrainz request URLs carry the UPC or the parent album's URL in their query. The spike's first run put a UPC into an error message that way, and it would have reached `results.json`; the harness now strips query strings from errors. In production, the same message would reach logs, Sentry (TS-115) and the job's `last_error` (TS-90).
3. **Retries.** A capture job that fails after `Get Album` must fetch the UPC again on retry, not save it in `jobs.payload`.

**Proposed for TS-41, to decide in TON-25:**

- don't cache a MusicBrainz lookup keyed by a Spotify value when it misses;
- strip query strings from MusicBrainz URLs in errors, logs and Sentry;
- derive Spotify values again on every attempt.

## Risks

- **The creator's Premium subscription.** A development-mode app stops working when its owner's Premium lapses. Step 3 would then fail for every Spotify link, which would fall back to manual entry unless step 2 knows it. The bridge should check its token at start-up and in the health check, so that failure is visible.
- **The UPC field can go again.** Spotify removed `external_ids` in February 2026 and restored it in March. A contract test or health check should flag an album without one.
- **Terms.** Whether a production service may run on a development-mode app, and on one owner's Premium account, is a question for the terms review (TON-17), along with Policy III.5.
- **Coverage, not precision, is the limit.** Most misses are editions MusicBrainz lacks, so recall grows only as MusicBrainz does.

## What this changes elsewhere

- **TS-41 step 3:** search the UPC as 12, 13 and 14 digits. With album identity, several releases of one album are confident. The data-handling points above apply. All of this waits for the G1 decision in TON-25.
- **TS-41 evidence:** batch endpoints are gone in development mode, and quota is per developer account.
- **TON-17:** gets the development-mode and Premium questions above.
- **TON-18 (G2):**
  - Trust's two *Best of* release groups are another case of one album under two release groups.
  - Track links shared from singles are a corpus case.

## Running it again

```sh
bun tooling/src/spikes/g1-spotify/sample.ts   # rebuilds links.txt and labels.json
bun tooling/src/spikes/g1-spotify/run.ts tooling/fixtures/g1-spotify/links.txt --burst 100
bun tooling/src/spikes/g1-spotify/run.ts tooling/fixtures/g1-spotify/links.txt --rerun-errors   # after 503s
```

- It needs `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in the repository root's `.env`; `.env.example` lists them.
- There is no cache, so each run makes every request again: about 5 minutes for 109 links, mostly MusicBrainz's queue.
- The generated tables are in `tooling/fixtures/g1-spotify/report.md`.
- The harness reuses TON-14's MusicBrainz client and link parser.
