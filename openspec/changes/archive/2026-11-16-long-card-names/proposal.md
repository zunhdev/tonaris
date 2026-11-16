# Proposal

## Why

Album cards cut the title and the artist to one line each. In 154 albums sampled from the creator's lists, one line cut 27% of titles on a computer and 42% on a phone; in the Handel folder, where a list's cards share a title, the artist was cut on 25% of cards and 75% on a phone. The creator picked variants 2H and 11 from a comparison page on 16 November 2026. Linear: TON-280.

## What Changes

- A card's title takes up to two lines. Its artist takes two when the title fits on one, and one otherwise (FR-05, DS-22).
- The year moves in front of the service links, on the card's last line: "1995 · Tidal ↗".
- Each row of cards is as tall as its fullest card needs: a row whose titles and artists all fit on one line is a line shorter, and the links line up within each row.
- A card shows only the links that fit whole, then "+N", which opens the "Open in…" chooser with every service (FR-06.5).
- On a computer, a cut title or artist shows whole in a tooltip.
- Guest pages' cards give the title and artist up to two lines each, with the year and links at the bottom (DS-72).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`: cards give long names a second line, keep the links on a last line, and size each row.
- `service-links`: a card names the services that fit, and "+N" opens the chooser.
- `sharing`: guest cards give long names a second line.
