## Outcomes per service and step

### Sample: wikidata-youtube-music-in-mb

| Links | n | 0 unsupported | 1 existing link | 2 URL: one release | 2 URL: several | 3 barcode: one release | 3 barcode: several | pending (TON-15/16) | unresolved | Identified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| YouTube Music album | 50 | 0 (0%) | 0 (0%) | 4 (8%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 46 (92%) | 4 (8%) |
| **All** | 50 | 0 (0%) | 0 (0%) | 4 (8%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 46 (92%) | 4 (8%) |

### Sample: wikidata-youtube-music-not-in-mb

| Links | n | 0 unsupported | 1 existing link | 2 URL: one release | 2 URL: several | 3 barcode: one release | 3 barcode: several | pending (TON-15/16) | unresolved | Identified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| YouTube Music album | 25 | 0 (0%) | 0 (0%) | 1 (4%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 24 (96%) | 1 (4%) |
| **All** | 25 | 0 (0%) | 0 (0%) | 1 (4%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 24 (96%) | 1 (4%) |

## Step 2: the canonical URL, or another stored form

### Sample: wikidata-youtube-music-in-mb

| Links naming an album | n | Canonical URL (TS-41 as written) | Only another stored form | Step 2 in all |
| --- | --- | --- | --- | --- |
| YouTube Music | 50 | 3 (6%) | 1 (2%) | 4 (8%) |

### Sample: wikidata-youtube-music-not-in-mb

| Links naming an album | n | Canonical URL (TS-41 as written) | Only another stored form | Step 2 in all |
| --- | --- | --- | --- | --- |
| YouTube Music | 25 | 0 (0%) | 1 (4%) | 1 (4%) |

## Step 2: URL forms MusicBrainz stores

| Stored form that matched | Links |
| --- | --- |
| YouTube Music: `https://music.youtube.com/playlist?list={id}` | 3 |
| YouTube Music: `https://www.youtube.com/playlist?list={id}` | 3 |

## Step 3: Qobuz album ids as barcodes

| Qobuz album id | Links | Found by URL | Found by barcode | …as a 12-digit UPC |
| --- | --- | --- | --- | --- |

## Enrichment of the identified releases

| Measure | Identified releases |
| --- | --- |
| Identified releases | 5 |
| Original year (release group's first release date) | 5 (100%) |
| Barcode in MusicBrainz | 5 (100%) |
| Cover Art Archive front for the release | 5 (100%) |
| …otherwise, a front for its release group | — |
| Classification (TS-45) | album 5 |
| Live (secondary type Live) | 0 (0%) |
| …with dated recording relationships (TS-46) | — |
| …dated only through the event recorded at | — |

## Failures

**Unresolved** (70)

- `https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM`: the URL isn't in MusicBrainz
- `https://music.youtube.com/playlist?list=OLAK5uy_nOq_2WK7qFIGu96ikQGp7XDKIstZqARY0`: the URL isn't in MusicBrainz
- `https://music.youtube.com/playlist?list=OLAK5uy_kUFhy8RqEHUJ8HEhlgrFICMS3PSA3MII8`: the URL isn't in MusicBrainz
- `https://music.youtube.com/playlist?list=OLAK5uy_kof2RIV9IuV_xHecMLF8ZhiiddUAsmTEo`: the URL isn't in MusicBrainz
- `https://music.youtube.com/playlist?list=OLAK5uy_mJraLItBAsCqyEHQbDxkXHZXVJ_XBeB2g`: the URL isn't in MusicBrainz
- `https://music.youtube.com/playlist?list=OLAK5uy_mTq8oHNGyHcFFpLQFbISKaQLMU6_SBTb4`: the URL isn't in MusicBrainz
- `https://music.youtube.com/playlist?list=OLAK5uy_mhZtCcub5ozvO0dSYdNsl2F9FCY-q5FLc`: the URL isn't in MusicBrainz
- `https://music.youtube.com/playlist?list=OLAK5uy_mmgfk_l8o4lLgRpaWe2DEYznStSxsU2qM`: the URL isn't in MusicBrainz

## Latency at 1 request/second


| Measure | First 50 links |
| --- | --- |
| Batch done (every link decided, identified ones enriched) | 57.4 s |
| MusicBrainz requests | 54 |
| Requests per link (mean) | 1.08 |
| Identified (one release) after batch start: p50 / p95 | 22.4 s / 53.9 s |
| Enriched after batch start: p50 / p95 | 23.5 s / 54.6 s |
| MusicBrainz response time: p50 / p95 | 61 / 269 ms |
| Queue wait per request, retries included: p50 / p95 | 939 / 949 ms |
| Requests that needed a retry after a 503 | 4 (5%) |
