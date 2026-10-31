# Tonaris — G1 spike: YouTube Music links, 31 October 2026

Spike for [TON-128](https://linear.app/zunhdev/issue/TON-128). In manual testing on 31 October 2026, the creator asked for YouTube Music albums, and chose a spike before the feature ([TON-131](https://linear.app/zunhdev/issue/TON-131)), as Tidal had ([TON-100](2026-10-20-g1-tidal.md)). This spike answers what identifying a pasted YouTube Music link can rely on, and what YouTube's terms allow:

- the link forms (TS-40);
- step 2, MusicBrainz's URL lookup: how often MusicBrainz knows the YouTube Music link of an album it has (TS-41);
- YouTube's terms for its pages and its API;
- step 4, hints from the YouTube Data API, measured with [TON-99](2026-10-19-g1-qobuz-hints.md)'s harness and rules;
- opening YouTube Music links (TS-43).

## Verdict

**YouTube Music links are identified by MusicBrainz's URL lookup and by hints from the YouTube Data API, never from its pages.**

- **Step 2 is precise but rare.** MusicBrainz knew the YouTube Music link of **4 of 50** albums it has (8%), each the right album, and 1 of 25 albums Wikidata doesn't link to MusicBrainz. That is far below Tidal's 46% and Apple's 53%.
- **The Data API's hints carry it.** TON-99's recommended rule identified **29 of 50** labelled links (58%), **29 of the 38** with hints (76%), and got **1 wrong**. It also matched 9 albums Wikidata doesn't link, all right when checked by hand.
- **Together, steps 2 and 4 identify 29 of the 50 albums MusicBrainz has (58%)**, against 4 with step 2 alone. Over the whole sample that is 39 of 75 (52%), with 1 wrong album.
- **The wrong one is an album taken for its namesake EP:** Peter Andre's *Natural* (1996) matched his *Natural* EP (1997), because the playlist's date says 1997. The playlist's track count would have told them apart; the feature compares it.
- **YouTube's pages are out.** Its terms forbid automated access except to search engines. Its API is allowed, with obligations: a privacy notice that says Tonaris uses YouTube API Services, nothing kept beyond 30 days, and a key.
- **It's weaker than Tidal's path** (88% with no error), mainly because 1 in 4 links gives no hints: playlists of official videos with no "- Topic" track, descriptions with no date, and playlists unavailable in Finland, where the spike ran.

With 1 error in 39 accepted matches, 9 of them checked by hand, the error rate is plausibly below about 12% (the 95% bound for one event, 4.74/39). That is a sample bound; the track-count check addresses the one failure seen.

## Decisions (31 October 2026)

The creator decided, after the measurements:

1. **YouTube Music becomes a launch service,** after Tidal: capture, matching, service links and opening, built in TON-131.
2. **Identification:** MusicBrainz's URL lookup, then transient hints from the YouTube Data API with TON-99's recommended rule and a track-count check. A link neither identifies asks for the album's details (FR-02.6). Nothing from YouTube is stored, and manual entry isn't prefilled from it.
3. **Production needs `YOUTUBE_API_KEY`** on the API service, and a privacy notice that says Tonaris uses YouTube API Services, which users agree to. The app has no privacy notice yet (TS-114), so TON-131 needs one before the API is used in production.

## Link forms

YouTube Music's share menu gives `https://music.youtube.com/playlist?list=OLAK5uy_…&si=…` for an album: an auto-generated playlist whose id starts `OLAK5uy_`. A track's share link is `https://music.youtube.com/watch?v={video}&si=…`, which names no album unless the player adds `&list=OLAK5uy_…`.

- **The canonical form** is `https://music.youtube.com/playlist?list={id}`. The album's id is the query, unlike the other services, so step 2 keeps it.
- **MusicBrainz stores** mostly `https://www.youtube.com/playlist?list={id}`, sometimes `music.youtube.com`'s. Step 2 asks for both, and `youtube.com`'s.
- **A track in an album** (`watch?v=…&list=OLAK5uy_…`) is identified through its album playlist.
- **Unsupported:** playlists that aren't albums (`PL…`, `RD…`), a video alone, and `music.youtube.com/browse/MPREb_…`, the album page's address in the web player, which names no playlist that any public API maps it to. The share link is the way to paste an album.
- The spike's parser is `tooling/src/spikes/g1-musicbrainz/links.ts`.

## Step 2: MusicBrainz's URL lookup

There are 75 album links in [`tooling/fixtures/g1-youtube-music/`](../../tooling/fixtures/g1-youtube-music/), drawn from Wikidata by [`sample.ts`](../../tooling/src/spikes/g1-youtube-music/sample.ts). Wikidata records an album's playlist as P4300 for 7,448 albums, 6,891 of them linked to MusicBrainz.

| Sample | Links | Known by URL | Right album |
| --- | --- | --- | --- |
| Wikidata, MusicBrainz release group known (P436) | 50 | 4 (8%) | 4 of 4 |
| Wikidata, no MusicBrainz link | 25 | 1 (4%) | — |

- **The right album every time,** but rarely: MusicBrainz holds about 100,000 YouTube album URLs, few for a catalog this size.
- **Both stored forms matter:** of the 5 found, 3 matched `music.youtube.com`'s form (one of them `www.youtube.com`'s too), and 2 only `www.youtube.com`'s.
- **Enrichment:** all 5 identified releases had an original year, a barcode and a Cover Art Archive front.

## YouTube's terms

- **The pages:** the [Terms of Service](https://www.youtube.com/t/terms) (in force since 5 January 2022) forbid accessing the Service "using any automated means (such as robots, botnets or scrapers)", except public search engines following robots.txt, with YouTube's prior written permission, or where law allows. So no page is read, unlike Qobuz's and Tidal's.
- **The API:** the [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) (updated 14 September 2026) and [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) (updated 15 October 2026) were read for this use.

| Tonaris would | YouTube says | Verdict |
| --- | --- | --- |
| Read a public album playlist, its tracks and one track, with an API key | Unauthorized `list` requests return public data | Allowed |
| Use the title, artist and date only as hints for a MusicBrainz search, keeping nothing | Non-authorized API data may be kept "not longer than 30 calendar days" (III.E.4) | Passes: nothing is kept |
| Store MusicBrainz's values for the album | No rule covers other sources' data; "derived data" (III.E.4.h) concerns metrics such as likes | Passes |
| Let agents add albums through MCP | No AI clause, unlike Tidal's terms | Passes |
| Show no YouTube data | Attribution is required where YouTube content is shown (III.F.2.a) | Not triggered |
| Have users agree to a privacy policy | Clients "must require users to agree to a privacy policy" that notifies them the client "uses YouTube API Services" (III.A.2) | **An obligation:** the privacy notice gains that sentence |
| Run within the quota | 10,000 units a day by default; more needs a compliance audit (III.D.3). YouTube may inspect clients at any time | 3 units a link: about 3,300 links a day |

There is no non-commercial clause, no ban on combining with other services and no AI clause. This is looser than Tidal's terms and Spotify's.

## Step 4: the YouTube Data API's hints

Three reads per link, with the key, in [`youtube.ts`](../../tooling/src/spikes/g1-youtube-music/youtube.ts), plugged into TON-99's harness:

1. `playlists.list`: the playlist's title is the album's, often after "Album - ", which is dropped. Its channel is "YouTube", not the artist.
2. `playlistItems.list`: the tracks. Their channel is usually "{artist} - Topic", the album's artist; sometimes the artist's official channel.
3. `videos.list` for the first "- Topic" track: its description, written by the distributor, gives "Released on: {date}", else "℗ {year}".

The first run took the artist from the description's credits and kept "Album - " in titles. It accepted 24, 23 right; reading the misses led to the Topic channel's artist and the cleaned title, which the numbers below use.

| Reads | Links |
| --- | --- |
| Gave title, artist and date | 59 of 75 (79%) |
| No "- Topic" track (official videos only) | 8 |
| No date in the description | 4 |
| Playlist unavailable (in Finland, or removed) | 4 |
| Dated 1 January (probably the year only) | 15 of 59 (25%) |
| The year is the album's first year, where the search found the right album | 28 of 33 (85%) |

| Rule (TON-99's, each changing one criterion) | Accepted | Wrong | Recall | Recall with hints | Several albums |
| --- | --- | --- | --- | --- | --- |
| Clean titles, artist credit, release year, one album | 21 | 1 | 39% | 53% | 4 |
| …release year or the album's original year | 22 | 1 | 41% | 55% | 5 |
| …loose titles and artist names (TON-16's rule) | 25 | 1 | 47% | 63% | 5 |
| **…official albums and EPs only** (recommended) | **30** | **1** | **57%** | **76%** | **0** |
| …without the year | 29 | 0 | 57% | 76% | 2 |

- **Among the labelled links step 2 misses,** the recommended rule adds 25 of 46 (54%), 25 of the 34 with hints (74%).
- **Without the year** avoids the one error but sends 2 albums to confirmation. Keeping the year and checking the track count does better: the album and the EP differ by several tracks.

**What fails**, of the 50 labelled links:
- **12 give no hints**: 7 playlists hold only official videos, whose descriptions aren't the distributor's; 3 descriptions give no date; 2 playlists are unavailable in Finland.
- **8 have hints but no album passes**: release dates that differ from MusicBrainz's (10 of the 33 searches that found the right album had no release on the date), a censored title ("Ballon d'##"), and a soundtrack credited to its film.
- **1 is wrong**: *Natural*, above.

## Opening

- **Desktop:** YouTube Music has no desktop app, only the web player (which Chrome can install as a web app). With the link setting on App, a YouTube Music link opens its page (TS-43).
- **Phones:** `music.youtube.com` links are universal links that the YouTube Music app takes when installed, as the other services' pages are.

## Cost

- **Three reads per link** to `www.googleapis.com`: p50 148, 204 and 25 ms. That's 3 quota units of 10,000 a day.
- **MusicBrainz:** 199 requests for 75 links, as for the other hinted services, with a title-only search for 19.
- **No throttling** in 212 reads 250 ms apart.

## What this changes elsewhere

- **PRD:** YouTube Music is a launch service (section 2.1), with a change-log entry.
- **TS-40:** YouTube Music's link forms.
- **TS-41:** its evidence, step 2's forms, the Data API's hints as step 4 with the track-count check, and that agents' captures use them too, as Apple's lookup.
- **TS-43:** "App" opens the page on desktop.
- **TS-105:** `YOUTUBE_API_KEY`.
- **TON-131** builds it, including the privacy notice's sentence.
- **Shared harness:** TON-14's chain and TON-99's hints harness run YouTube Music (`--service youtube-music`); the other services' results are unchanged.

## Running it again

Nothing YouTube's API gave is kept in the repository: the hints run writes no cache, and its `results.json` drops the dates it read (the Developer Policies keep API data 30 days at most). The report's aggregates come from the run itself.

```sh
bun tooling/src/spikes/g1-youtube-music/sample.ts                                      # links.txt and labels.json
bun tooling/src/spikes/g1-musicbrainz/run.ts tooling/fixtures/g1-youtube-music/links.txt --cache   # step 2
bun tooling/src/spikes/g1-qobuz-hints/run.ts tooling/fixtures/g1-youtube-music/links.txt \
  --service youtube-music --out tooling/fixtures/g1-youtube-music/hints                # step 4; needs YOUTUBE_API_KEY
```
