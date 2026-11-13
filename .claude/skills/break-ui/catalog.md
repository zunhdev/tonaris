# Worst-case catalog for Tonaris

Real values that break music UI. Use `example.com` or `.test` addresses for any email or link, so nothing points at a real inbox.

## Album titles

| Value | Breaks |
| --- | --- |
| `Symphony No. 9 in D minor, Op. 125 "Choral": IV. Presto – Allegro assai – Andante maestoso – Allegro energico, sempre ben marcato` | A long title with punctuation: wrapping in rows and cards, ellipsis in the inspector |
| `Sgt. Pepper's Lonely Hearts Club Band (Remastered 2009) [Super Deluxe Edition]` | Edition suffixes; sorting and search keys |
| `I` | One letter: an empty-looking column; the fallback tile's letter |
| `...And Justice for All` | Leading punctuation: the fallback tile letter (TON-110) and sorting |
| `Ágætis byrjun` | A leading accented capital: sorting and search ("agaetis") |
| `Мумий Тролль` / `Βαγγέλης` | Cyrillic and Greek: Latin search (TON-201), font coverage |
| `坂本龍一` | CJK with no spaces: breaks anywhere; searched only as written |
| `ثلاثية` | Right to left: punctuation and icons on the wrong side without `dir="auto"` |
| `Pneumonoultramicroscopicsilicovolcanoconiosis` | A long word with no break opportunity |
| A title at the 1,000-code-point limit | The longest the domain accepts |

## Artist credits

| Value | Breaks |
| --- | --- |
| `Berliner Philharmoniker, Herbert von Karajan, Wiener Singverein, Gundula Janowitz, Hilde Rössel-Majdan, Waldemar Kmentt, Walter Berry` | A classical credit: the longest real credits run hundreds of characters |
| `Ólafur Arnalds & Nils Frahm` | Ampersands and accents |
| `!!!` | No letters at all: initials, sorting, search |
| `Sigur Rós` / `Røyksopp` / `Łona` | Letters without an accent-free form: Latin search |
| *(missing)* | An album saved without an artist |

## Folder, list and field names

| Value | Breaks |
| --- | --- |
| A 200-code-point list name | The sidebar row: name, count and menu on one line (TON-156, TON-180) |
| `Best of 2026 — vinyl only (to buy at Rough Trade, ask about the Japanese pressings)` | A long, natural name in breadcrumbs and Move to |
| `A` | A one-letter name |
| Two lists both called `Favorites` in different folders | Names alone can't tell them apart in search or Move to |
| A folder 32 levels deep (`maxContainerDepth`) | Indentation in the sidebar and the finder |
| A 2,000-character description | Clamping and "show more" in the list header |
| A choice field with 100 options | The option menu's height and filter |

## Counts and numbers

| Value | Breaks |
| --- | --- |
| `0` albums, lists, members | Empty states, and whether each screen has one |
| `1` of each | "1 album", "1 list", "1 person": singular forms |
| `5,000` albums (the account limit) | The usage meter, counts in the sidebar, virtualization |
| `2,066` entries in one shared folder | The guest page's first paint |
| Year `1877` / missing year / `2026` | Release-year columns and grouping |

## Artwork and links

| Value | Breaks |
| --- | --- |
| No artwork | The fallback tile and its letter |
| Artwork whose URL answers 404 | The broken-image fallback |
| A 3000×300 or 300×3000 image | `object-fit: cover`, card heights |
| Every service link set (Spotify, Apple Music, Qobuz, Tidal, YouTube Music) | The service-link row's width on a phone |
| No service links | The row's empty state |

## Sharing and people

| Value | Breaks |
| --- | --- |
| Owner's display name `Aleksandra Wiśniewska-Kowalczyk` | "Denis's Trash" style copy with a long name and a possessive |
| Display name `Jo` / one emoji `🦊` | Initials and possessives with short or non-letter names |
| `bartholomew.fitzgerald@northwind-holdings.example.com` | Invitation rows: an email with no break opportunities |
| A share with 20 people | The sharing dialog's list |
| You as both owner and viewer of nested shares | Role labels where the higher role wins |

## States and environment

| Condition | Breaks |
| --- | --- |
| Offline, or a save that fails | Save states and the offline notice |
| A conflict from another session | The conflict review |
| Read-only (a viewer) on every screen | Disabled actions keep the layout |
| 320 px wide, 200 % zoom | Every overflow above at once |
| A touch device | Actions that only appear on hover can't be reached |
