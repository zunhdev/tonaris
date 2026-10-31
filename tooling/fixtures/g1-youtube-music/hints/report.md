## Sample

| Sample | Links | Labelled | Known by URL (step 2) | Page hints | Right album in the search |
| --- | --- | --- | --- | --- | --- |
| wikidata-youtube-music-in-mb | 50 | 50 | 4 | 38 | 33 (66%) |
| wikidata-youtube-music-not-in-mb | 25 | 1 | 1 | 21 | 0 (0%) |

## What the pages gave

| Pages | Links |
| --- | --- |
| Gave title, artist and date | 59 (79%) |
| No hints: the playlist isn't available | 4 |
| No hints: the description gives no date | 4 |
| No hints: no track is on a "- Topic" channel | 8 |
| og:title adds a version note to the name | 0 (0%) |
| Date is 1 January (likely year only) | 15 (25%) |
| Date is the 1st of a month | 1 (2%) |

| The page's year, where the search found the right album | Of 33 links |
| --- | --- |
| Is the album's first year | 28 (85%) |
| Is the year of one of its releases | 29 (88%) |
| Is neither | 3 (9%) |

## Rules on every labelled link

| Rule | Accepted | Right | Wrong | Precision | Recall | Recall with hints | Several | None |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clean titles, artist credit, release year, one album | 21 | 20 | 1 | 20 (95%) | 20 (39%) | 20 (53%) | 4 | 26 |
| …release or original year | 22 | 21 | 1 | 21 (95%) | 21 (41%) | 21 (55%) | 5 | 24 |
| …loose titles and artist names (TON-16's rule) | 25 | 24 | 1 | 24 (96%) | 24 (47%) | 24 (63%) | 5 | 21 |
| …official albums and EPs only (G2's proposal) | 30 | 29 | 1 | 29 (97%) | 29 (57%) | 29 (76%) | 0 | 21 |
| …with Qobuz's version note in the title | 30 | 29 | 1 | 29 (97%) | 29 (57%) | 29 (76%) | 0 | 21 |
| …without the year | 29 | 29 | 0 | 29 (100%) | 29 (57%) | 29 (76%) | 2 | 20 |

## Rules on the labelled links step 2 misses (what step 4 adds)

| Rule | Accepted | Right | Wrong | Precision | Recall | Recall with hints | Several | None |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clean titles, artist credit, release year, one album | 19 | 18 | 1 | 18 (95%) | 18 (39%) | 18 (53%) | 3 | 24 |
| …release or original year | 20 | 19 | 1 | 19 (95%) | 19 (41%) | 19 (56%) | 4 | 22 |
| …loose titles and artist names (TON-16's rule) | 22 | 21 | 1 | 21 (95%) | 21 (46%) | 21 (62%) | 4 | 20 |
| …official albums and EPs only (G2's proposal) | 26 | 25 | 1 | 25 (96%) | 25 (54%) | 25 (74%) | 0 | 20 |
| …with Qobuz's version note in the title | 26 | 25 | 1 | 25 (96%) | 25 (54%) | 25 (74%) | 0 | 20 |
| …without the year | 25 | 25 | 0 | 25 (100%) | 25 (54%) | 25 (74%) | 2 | 19 |

## "…official albums and EPs only (G2's proposal)" by sample

| Sample | Labelled | With hints | Accepted | Right | Wrong | Several |
| --- | --- | --- | --- | --- | --- | --- |
| wikidata-youtube-music-in-mb | 50 | 38 | 30 | 29 | 1 | 0 |
| wikidata-youtube-music-not-in-mb | 1 | 0 | 0 | 0 | 0 | 0 |

## What the right album's releases fail

| No release of the right album matches the… | Of 33 links whose right album the search found |
| --- | --- |
| Title, exactly | 2 (6%) |
| Title, with edition notes dropped | 0 (0%) |
| Artist credit | 5 (15%) |
| Release date | 10 (30%) |
| Release year or original year | 3 (9%) |

## Examples for "…official albums and EPs only (G2's proposal)"

- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM` (*ab88ca0b-da32-4e01-ae9b-198b0b7b8681*): the playlist isn't available.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_kUFhy8RqEHUJ8HEhlgrFICMS3PSA3MII8` (*1fe9f852-912b-4f23-9ca9-32efe6028e10*): the description gives no date.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_kof2RIV9IuV_xHecMLF8ZhiiddUAsmTEo` (*0b5d1515-3418-4b1d-95ae-19aa03d077fb*): the description gives no date.
- Wrong: `https://music.youtube.com/playlist?list=OLAK5uy_mJraLItBAsCqyEHQbDxkXHZXVJ_XBeB2g` matched *Natural*, but it is *Natural*.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_mTq8oHNGyHcFFpLQFbISKaQLMU6_SBTb4` (*e58d0c80-af55-3bae-bde5-72ea9b3349d1*): the playlist isn't available.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_kfIv0AyUwExGW4IXvQ-WFAaho_pfOUPMk` (*716eac64-60ff-3738-954c-d232b9868445*): no track is on a "- Topic" channel.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_najHmcPZPZf9-X7iCD609ZxEPtZEcVig8` (*c045e294-201c-47a0-9103-18641e0a2600*): the search didn't find the album.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_nuy_agWBN8fGPG2o2QaTa4reg7TRY753A` (*24380693-cbd0-462e-8af0-0cf0c085e1ce*): no track is on a "- Topic" channel.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_moX9ehXpGgVAGvk2CA4DEDSBXNCbr7JJM` (*41242792-66fd-46e4-acae-2cc0538ec0e2*): no track is on a "- Topic" channel.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_lMzn4UmJqIbuJnNa8BuaqfTykpIWPEqEw` (*I AM: CELINE DION: Original Motion Picture Soundtrack*): none, 0 albums passed.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_l5hRuFmU1Ma476JCr614zn8LeZ9VWxzTM` (*a0885a1b-f473-339f-a29b-1c5cfe3a877d*): the search didn't find the album.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_n1BV7pwac8PY0Q3dK3p9gjsnCN_ERji70` (*98eb32c9-239c-377b-9cff-36680957296b*): the description gives no date.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_k0RQ46mGYAoFJGXvxL10po7kz8oxucGFk` (*9e4a83c1-afe9-3826-be19-76836492702b*): no track is on a "- Topic" channel.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_nqPSmM9xzqL8wn7CpKEKAK4BC8ts4SJ6Y` (*7d91468d-bc5b-4c79-9177-551bdc0bca29*): no track is on a "- Topic" channel.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_m8rowxWxqDQrU9m1RTZhOpc5L6seXlyLM` (*db4ede8c-116d-4203-ba4a-6d4f41369b65*): no track is on a "- Topic" channel.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_nI9w1_06NA0_hC2LUqsmC0gnWX2XczAbM` (*01a5da18-0dcf-3976-9684-3569b71792de*): the search didn't find the album.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_kd8jcSDXbhWryRBX8GfGHEo2AOjCfz8L8` (*21717c25-2fbf-4a18-8e47-b58ef9531075*): no track is on a "- Topic" channel.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_lJuIHOAEKrCzcQkyLpM3RO-7qhHM-ZV-Q` (*683b30ca-3725-4665-8183-f36e9c6fe6e4*): the search didn't find the album.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_lct9GI8xsYeU2LElXgTgXyk19M1b5NfzA` (*29ff71e3-517f-3c77-9caa-4275a60cf97e*): the search didn't find the album.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_mdi2ft0-jqXDcQmXTOuCLDBRi1t3gvjPs` (*Rapattitude*): none, 0 albums passed.
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_nt2ult4e2Up8zFJnoV04okLiB2HKcsiFw` (*The Mystical Beast of Rebellion*): none, 0 albums passed.
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_lIwjWv58qzpW1lp9gXu4jDE6Ip-GZONDE` matched *B4 Day One* (d3218330-0911-41e5-b77c-ee0f83401a2d).
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_lkLoTo2SThW2J3bCmOMcNQ9ZAonUvtX3I` matched *Wake Up* (5bd235a5-8a36-358e-a8f2-d10a91b8112d).
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_nRSshj1LFyJtsbgs87r1kC0DKzbJ5CqrM` matched *Living Hope* (a8e02272-debd-43ac-9305-2d023cb1dfd9).
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_kittzedPdqU13PRjfP6gMl1Ty2CoeSWvg` matched *Constellations* (4d1acb2a-624b-4f83-8f5e-945bafd77a0e).
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_n1eyOqdB0LjHTPtKfV-Qu8dp6TRl91whU` matched *אומץ* (66518299-2ae2-4ce7-a5dc-c75397b38f14).
- Missed: `https://music.youtube.com/playlist?list=OLAK5uy_n1wz18814gAsfJyV5RqFs8DM7ihHco5zI` (*c77e5622-fb15-4dbf-9be1-f2d4865c2f27*): the playlist isn't available.
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_mZoTEL3wNRUjEMmNk8BJdMP_TEOi1V3SI` matched *Spirit* (555cd686-0ed1-49c2-b0a8-54fce311cbec).
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_nQLOjE9HYnAnz_c4PJBSr9PmJ2pcUUpug` matched *Девки, пиво и рок-н-ролл* (64f94743-ca50-4887-82a5-1d15ccf32d34).
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_nnaUQRRk-AyaNFXWCoK_oowbdi_RGSodg` matched *Sputnik* (4ef4b155-0368-42a3-8773-6f7ff25b9f62).
- Unlabelled, check by hand: `https://music.youtube.com/playlist?list=OLAK5uy_mMaDalJdClrqKk_UlmDqRudkHWjgHxWUw` matched *H.O.T.* (d3e85e77-9507-4a0e-92d2-41b0b71bcd60).

## Requests

| Store request | Requests | Statuses | Time p50 / p95 |
| --- | --- | --- | --- |
| `playlists.list`, the album playlist | 76 | 200 × 76 | 148 / 204 ms |
| `playlistItems.list`, its tracks | 72 | 200 × 72 | 204 / 338 ms |
| `videos.list`, one track's description | 64 | 200 × 64 | 25 / 76 ms |

Requests to www.googleapis.com per link: 1 for 4 links, 2 for 8 links, 3 for 63 links. 199 MusicBrainz requests for 75 links, 19 of them with a title-only fallback search; candidates per search p50 1, p95 25.
