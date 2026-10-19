## Sample

| Sample | Links | Labelled | Known by URL (step 2) | Page hints | Right album in the search |
| --- | --- | --- | --- | --- | --- |
| creator | 5 | 5 | 2 | 4 | 3 (60%) |
| wikidata-qobuz-in-mb | 15 | 15 | 6 | 12 | 12 (80%) |
| wikidata-qobuz-not-in-mb | 4 | 1 | 1 | 4 | 1 (100%) |
| g2-qobuz-editions | 50 | 50 | 43 | 43 | 38 (76%) |

## What the pages gave

| Pages | Links |
| --- | --- |
| Gave title, artist and date | 63 (85%) |
| No hints: the page answered 404 | 11 |
| og:title adds a version note to the name | 16 (25%) |
| Date is 1 January (likely year only) | 5 (8%) |
| Date is the 1st of a month | 8 (13%) |

| The page's year, where the search found the right album | Of 54 links |
| --- | --- |
| Is the album's first year | 50 (93%) |
| Is the year of one of its releases | 50 (93%) |
| Is neither | 2 (4%) |

## Rules on every labelled link

| Rule | Accepted | Right | Wrong | Precision | Recall | Recall with hints | Several | None |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clean titles, artist credit, release year, one album | 38 | 37 | 1 | 37 (97%) | 37 (52%) | 37 (62%) | 8 | 25 |
| …release or original year | 41 | 40 | 1 | 40 (98%) | 40 (56%) | 40 (67%) | 8 | 22 |
| …loose titles and artist names (TON-16's rule) | 44 | 43 | 1 | 43 (98%) | 43 (61%) | 43 (72%) | 8 | 19 |
| …official albums and EPs only (G2's proposal) | 48 | 48 | 0 | 48 (100%) | 48 (68%) | 48 (80%) | 3 | 20 |
| …with Qobuz's version note in the title | 46 | 46 | 0 | 46 (100%) | 46 (65%) | 46 (77%) | 3 | 22 |
| …without the year | 37 | 36 | 1 | 36 (97%) | 36 (51%) | 36 (60%) | 15 | 19 |

## Rules on the labelled links step 2 misses (what step 4 adds)

| Rule | Accepted | Right | Wrong | Precision | Recall | Recall with hints | Several | None |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clean titles, artist credit, release year, one album | 8 | 7 | 1 | 7 (88%) | 7 (37%) | 7 (58%) | 0 | 11 |
| …release or original year | 10 | 9 | 1 | 9 (90%) | 9 (47%) | 9 (75%) | 0 | 9 |
| …loose titles and artist names (TON-16's rule) | 10 | 9 | 1 | 9 (90%) | 9 (47%) | 9 (75%) | 0 | 9 |
| …official albums and EPs only (G2's proposal) | 9 | 9 | 0 | 9 (100%) | 9 (47%) | 9 (75%) | 0 | 10 |
| …with Qobuz's version note in the title | 8 | 8 | 0 | 8 (100%) | 8 (42%) | 8 (67%) | 0 | 11 |
| …without the year | 7 | 6 | 1 | 6 (86%) | 6 (32%) | 6 (50%) | 3 | 9 |

## "…official albums and EPs only (G2's proposal)" by sample

| Sample | Labelled | With hints | Accepted | Right | Wrong | Several |
| --- | --- | --- | --- | --- | --- | --- |
| creator | 5 | 4 | 3 | 3 | 0 | 0 |
| wikidata-qobuz-in-mb | 15 | 12 | 12 | 12 | 0 | 0 |
| wikidata-qobuz-not-in-mb | 1 | 1 | 1 | 1 | 0 | 0 |
| g2-qobuz-editions | 50 | 43 | 32 | 32 | 0 | 3 |

## What the right album's releases fail

| No release of the right album matches the… | Of 54 links whose right album the search found |
| --- | --- |
| Title, exactly | 8 (15%) |
| Title, with edition notes dropped | 3 (6%) |
| Artist credit | 5 (9%) |
| Release date | 6 (11%) |
| Release year or original year | 2 (4%) |

## Examples for "…official albums and EPs only (G2's proposal)"

- Missed: `https://open.qobuz.com/album/z96u0k0znz1xb` (*95959c5f-6011-4c20-b932-0a70b529e045*): the search didn't find the album.
- Missed: `https://open.qobuz.com/album/0884977423006` (*da40e720-2097-3730-8a7f-0c2ddbff4a96*): the page answered 404.
- Missed: `https://open.qobuz.com/album/d4bpey5kkf9hc` (*32faf671-3b3e-3271-b497-a0631605b0f6*): the page answered 404.
- Missed: `https://open.qobuz.com/album/c8f0bs8nq70uc` (*eecbdbee-026b-3c45-ba03-ed451c4ee2d1*): the page answered 404.
- Missed: `https://open.qobuz.com/album/z9rzcky5afxpa` (*27dbe512-f2b0-4519-b8ca-7e45ae06c100*): the page answered 404.
- Unlabelled, check by hand: `https://open.qobuz.com/album/qz7xo3ta060tb` matched *anthology* (40871145-8a3e-47cf-9268-ace456286691).
- Unlabelled, check by hand: `https://open.qobuz.com/album/aa7odiq1cg78a` matched *Recht harmonisch* (4ee44223-a53c-4204-95a8-e0ba7cd12ac2).
- Missed: `https://www.qobuz.com/us-en/album/weezer-teal-album-weezer/mco0vy9isdq4a` (*c27987a9-d3bb-4929-8526-d3507e92a041*): the search didn't find the album.
- Missed: `https://www.qobuz.com/us-en/album/-/oulc1w5vun56a` (*Red (Taylor’s version)*): ambiguous, 2 albums passed.
- Missed: `https://www.qobuz.com/us-en/album/with-sonny-boy-williamson-the-animals/0884385954895` (*The Animals With Sonny Boy Williamson*): none, 0 albums passed.
- Missed: `http://www.qobuz.com/nl-nl/album/punk-goes-pop-vol-4-multi-interpretes/0088807239330` (*690e3fc0-8862-4605-a3d3-eeed6ba6aed6*): the page answered 404.
- Missed: `https://www.qobuz.com/fi-en/album/-/r8361te6k0cic` (*d2e4838d-90e1-471c-bda0-fd816dabb2d4*): the search didn't find the album.
- Missed: `https://www.qobuz.com/gb-en/album/animals-the-animals/0724385669958` (*The Animals*): none, 0 albums passed.
- Missed: `https://www.qobuz.com/us-en/album/sznz-autumn-weezer/xwxlqkk8y2t0a` (*SZNZ: Autumn*): ambiguous, 2 albums passed.
- Missed: `http://www.qobuz.com/album/white-crosses-against-me/0191515275875` (*f8f1fe07-3e6e-491e-bd1e-34c51163600f*): the page answered 404.
- Missed: `https://www.qobuz.com/fr-fr/album/et-moi-et-moi-et-moi-jacques-dutronc/0888880362315` (*Jacques Dutronc*): ambiguous, 2 albums passed.
- Missed: `https://www.qobuz.com/us-en/album/are-you-experienced-the-jimi-hendrix-experience/0884977413885` (*Are You Experienced*): none, 0 albums passed.
- Missed: `http://www.qobuz.com/album/most-of-the-animals-the-animals/0724353829650` (*ae49221c-0e0b-3228-86c6-c5f5685ba184*): the page answered 404.
- Missed: `https://www.qobuz.com/album/ces-gens-la-jacques-brel/0060252748014` (*40fa1a54-e679-31f1-a9fc-00ee649a9b74*): the page answered 404.
- Missed: `https://www.qobuz.com/us-en/album/blue-green-red-weezer/e7io1mq9w1g5b` (*9b8af98f-8214-32ee-9b05-96b8c557f7f0*): the search didn't find the album.
- Missed: `https://www.qobuz.com/de-de/album/the-sensual-world-2018-remaster-kate-bush/rrs0uy68ypb4a` (*ad555095-b0a6-42c8-87aa-8ba035d20e12*): the page answered 404.
- Missed: `https://www.qobuz.com/de-de/album/peter-gabriel-3-melt-peter-gabriel/uh28en7k1wu0b` (*fe9f06cd-a160-3114-85fd-102726dddc0b*): the search didn't find the album.
- Missed: `http://www.qobuz.com/album/weezer-white-album-weezer/0075679912787` (*18fa1fe1-1cfd-431f-906d-a335f245d220*): the search didn't find the album.
- Missed: `https://www.qobuz.com/nl-nl/album/ella-fitzgerald-sings-the-cole-porter-song-book-ella-fitzgerald/0060255741426` (*dcc0d723-e27f-36e8-8438-dbbde7eb9a67*): the page answered 404.
- Missed: `https://www.qobuz.com/us-en/album/-/ybo3lnns8dfwa` (*c1a568c7-055c-374a-9d92-9ea077f2bf1f*): the page answered 404.

## Requests

| Qobuz request | Requests | Statuses | Time p50 / p95 |
| --- | --- | --- | --- |
| A: `/us-en/album/-/{id}`, redirect read | 29 | 200 × 1, 301 × 28 | 20 / 155 ms |
| B: the album page | 79 | 200 × 62, 301 × 6, 404 × 11 | 82 / 336 ms |
| robots.txt, once per run | 1 | 200 × 1 | 245 / 245 ms |

Requests to www.qobuz.com per link: 1 for 40 links, 2 for 34 links. 205 MusicBrainz requests for 74 links, 6 of them with a title-only fallback search; candidates per search p50 7, p95 100.
