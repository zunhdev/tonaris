## Sample

| Sample | Links | Labelled | Known by URL (step 2) | iTunes hints | Right album in the search |
| --- | --- | --- | --- | --- | --- |
| creator | 6 | 6 | 2 | 6 | 5 (83%) |
| wikidata-apple-in-mb | 15 | 15 | 8 | 12 | 11 (73%) |
| wikidata-apple-not-in-mb | 10 | 0 | 0 | 9 | — |
| wikidata-apple-extra | 50 | 50 | 22 | 36 | 35 (70%) |

## Rules on every labelled link

| Rule | Accepted | Right | Wrong | Precision | Recall | Recall with hints | Several | None |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TS-41 as written: one release | 15 | 15 | 0 | 15 (100%) | 15 (21%) | 15 (28%) | 15 | 41 |
| the same, one album | 30 | 30 | 0 | 30 (100%) | 30 (42%) | 30 (56%) | 0 | 41 |
| …clean titles | 31 | 31 | 0 | 31 (100%) | 31 (44%) | 31 (57%) | 0 | 40 |
| …release year instead of date | 32 | 32 | 0 | 32 (100%) | 32 (45%) | 32 (59%) | 0 | 39 |
| …and original year allowed | 40 | 39 | 1 | 39 (98%) | 39 (55%) | 39 (72%) | 1 | 30 |
| …original year, tracks ±1 | 44 | 43 | 1 | 43 (98%) | 43 (61%) | 43 (80%) | 1 | 26 |
| …original year, no track count | 45 | 45 | 0 | 45 (100%) | 45 (63%) | 45 (83%) | 2 | 24 |
| …original year, first artist only | 40 | 39 | 1 | 39 (98%) | 39 (55%) | 39 (72%) | 1 | 30 |
| …loose titles and artist names, no track count | 47 | 47 | 0 | 47 (100%) | 47 (66%) | 47 (87%) | 2 | 22 |
| …loose, tracks ±1 | 46 | 45 | 1 | 45 (98%) | 45 (63%) | 45 (83%) | 1 | 24 |
| …loose, without the date | 47 | 46 | 1 | 46 (98%) | 46 (65%) | 46 (85%) | 4 | 20 |

## Rules on the labelled links step 2 misses (what step 4 adds)

| Rule | Accepted | Right | Wrong | Precision | Recall | Recall with hints | Several | None |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TS-41 as written: one release | 7 | 7 | 0 | 7 (100%) | 7 (18%) | 7 (27%) | 3 | 29 |
| the same, one album | 10 | 10 | 0 | 10 (100%) | 10 (26%) | 10 (38%) | 0 | 29 |
| …clean titles | 11 | 11 | 0 | 11 (100%) | 11 (28%) | 11 (42%) | 0 | 28 |
| …release year instead of date | 12 | 12 | 0 | 12 (100%) | 12 (31%) | 12 (46%) | 0 | 27 |
| …and original year allowed | 17 | 16 | 1 | 16 (94%) | 16 (41%) | 16 (62%) | 0 | 22 |
| …original year, tracks ±1 | 18 | 17 | 1 | 17 (94%) | 17 (44%) | 17 (65%) | 0 | 21 |
| …original year, no track count | 19 | 19 | 0 | 19 (100%) | 19 (49%) | 19 (73%) | 1 | 19 |
| …original year, first artist only | 17 | 16 | 1 | 16 (94%) | 16 (41%) | 16 (62%) | 0 | 22 |
| …loose titles and artist names, no track count | 21 | 21 | 0 | 21 (100%) | 21 (54%) | 21 (81%) | 1 | 17 |
| …loose, tracks ±1 | 20 | 19 | 1 | 19 (95%) | 19 (49%) | 19 (73%) | 0 | 19 |
| …loose, without the date | 23 | 22 | 1 | 22 (96%) | 22 (56%) | 22 (85%) | 1 | 15 |

## What the right album's releases fail

| No release of the right album matches the… | Of 51 links whose right album the search found |
| --- | --- |
| Title, exactly | 10 (20%) |
| Title, with edition notes dropped | 2 (4%) |
| Artist credit | 4 (8%) |
| Track count | 7 (14%) |
| Release date | 8 (16%) |
| Release year or original year | 1 (2%) |

## Examples for "…loose titles and artist names, no track count"

- Missed: `https://music.apple.com/fi/album/tchaikovsky-the-nutcracker-remastered-2026/6809480000` (*5fe75120-028e-4157-b6c6-322e86dcf89d*): the search didn't find the album.
- Missed: `https://music.apple.com/us/album/1693409117` (*שמחת חינם*): none, 0 albums passed.
- Missed: `https://music.apple.com/us/album/1030797896` (*Cançons de la veritat oculta*): none, 0 albums passed.
- Missed: `https://music.apple.com/us/album/254249657` (*b0baefd8-a463-3946-8397-1dcee5c8e7b1*): the search didn't find the album.
- Missed: `https://music.apple.com/us/album/1452902328` (*d26c1a77-b641-36b9-bafa-b4df05cc4aab*): the search didn't find the album.
- Missed: `https://music.apple.com/us/album/927744704` (*Iowa*): ambiguous, 2 albums passed.
- Missed: `https://music.apple.com/us/album/456659855` (*I miei ricordi...*): none, 0 albums passed.

## Requests

34 MusicBrainz requests and 3 iTunes Lookup calls for 81 links, 13 of them with a title-only fallback search; candidates per search p50 2, p95 23.
