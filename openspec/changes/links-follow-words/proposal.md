# Proposal

## Why

Since TON-280 an album card's year and links sit on its bottom line. On a short card in a taller row they end up 20 px below the artist but 16 px above the next row's cover, and on these borderless cards they read as that cover's caption. The creator agreed on 16 November 2026 to let them follow the words instead. Linear: TON-284.

## What Changes

- The year and links follow right after the artist, in the workspace and on guest pages (DS-22, DS-72).
- Rows keep TON-280's heights; the spare room of a short card falls below its links.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`: a card's year and links follow its artist.
- `sharing`: a guest card's year and links follow its artist.
