## Outcomes per service and step

### Sample: wikidata-tidal-in-mb

| Links | n | 0 unsupported | 1 existing link | 2 URL: one release | 2 URL: several | 3 barcode: one release | 3 barcode: several | pending (TON-15/16) | unresolved | Identified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tidal album | 50 | 0 (0%) | 0 (0%) | 23 (46%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 27 (54%) | 23 (46%) |
| **All** | 50 | 0 (0%) | 0 (0%) | 23 (46%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 27 (54%) | 23 (46%) |

### Sample: wikidata-tidal-not-in-mb

| Links | n | 0 unsupported | 1 existing link | 2 URL: one release | 2 URL: several | 3 barcode: one release | 3 barcode: several | pending (TON-15/16) | unresolved | Identified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tidal album | 25 | 0 (0%) | 0 (0%) | 1 (4%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 24 (96%) | 1 (4%) |
| **All** | 25 | 0 (0%) | 0 (0%) | 1 (4%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 24 (96%) | 1 (4%) |

## Step 2: the canonical URL, or another stored form

### Sample: wikidata-tidal-in-mb

| Links naming an album | n | Canonical URL (TS-41 as written) | Only another stored form | Step 2 in all |
| --- | --- | --- | --- | --- |
| Tidal | 50 | 23 (46%) | 0 (0%) | 23 (46%) |

### Sample: wikidata-tidal-not-in-mb

| Links naming an album | n | Canonical URL (TS-41 as written) | Only another stored form | Step 2 in all |
| --- | --- | --- | --- | --- |
| Tidal | 25 | 1 (4%) | 0 (0%) | 1 (4%) |

## Step 2: URL forms MusicBrainz stores

| Stored form that matched | Links |
| --- | --- |
| Tidal: `https://tidal.com/album/{id}` | 24 |

## Step 3: Qobuz album ids as barcodes

| Qobuz album id | Links | Found by URL | Found by barcode | …as a 12-digit UPC |
| --- | --- | --- | --- | --- |

## Enrichment of the identified releases

| Measure | Identified releases |
| --- | --- |
| Identified releases | 24 |
| Original year (release group's first release date) | 24 (100%) |
| Barcode in MusicBrainz | 24 (100%) |
| Cover Art Archive front for the release | 23 (96%) |
| …otherwise, a front for its release group | 1 (100%) |
| Classification (TS-45) | album 22, compilation 2 |
| Live (secondary type Live) | 0 (0%) |
| …with dated recording relationships (TS-46) | — |
| …dated only through the event recorded at | — |

## Failures

**Unresolved** (51)

- `https://tidal.com/browse/album/348182611`: the URL isn't in MusicBrainz
- `https://tidal.com/browse/album/110769428`: the URL isn't in MusicBrainz
- `https://tidal.com/browse/album/165813921`: the URL isn't in MusicBrainz
- `https://tidal.com/browse/album/2044762`: the URL isn't in MusicBrainz
- `https://tidal.com/browse/album/4644898`: the URL isn't in MusicBrainz
- `https://tidal.com/browse/album/250495068`: the URL isn't in MusicBrainz
- `https://tidal.com/browse/album/88243428`: the URL isn't in MusicBrainz
- `https://tidal.com/browse/album/25841746`: the URL isn't in MusicBrainz

## Latency at 1 request/second


| Measure | First 50 links |
| --- | --- |
| Batch done (every link decided, identified ones enriched) | 75.3 s |
| MusicBrainz requests | 73 |
| Requests per link (mean) | 1.46 |
| Identified (one release) after batch start: p50 / p95 | 34.4 s / 64.3 s |
| Enriched after batch start: p50 / p95 | 35.2 s / 65.3 s |
| MusicBrainz response time: p50 / p95 | 104 / 404 ms |
| Queue wait per request, retries included: p50 / p95 | 908 / 952 ms |
| Requests that needed a retry after a 503 | 3 (3%) |
