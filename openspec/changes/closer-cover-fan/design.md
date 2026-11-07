# Design

## Context

- `CoverFan` places a card's covers with classes only (`left-[…]`, `top-[…]`, `w-[76%]`), because guest pages render it on the server, where the CSP refuses style attributes. The caller gives it a square, `relative` box.
- The landing page's folder picture copies the same places in `fanPlaces`.

## Decisions

### 1. Bigger covers rather than a smaller fan

Halving the step alone would leave the fan 88% of the card: either a gap at the top and right, or, centred, a front cover out of line with the card's name. Growing the covers to 88% keeps the fan's outline as it was. The front cover stays at the bottom left and the back one reaches the top-right corner, where the save state sits. Each cover behind still shows a strip 6% of the card wide, about 10 px on a 160 px card.

### 2. The same places, halved

Three covers, back to front: `left-[12%] top-0`, `left-[6%] top-[6%]`, `left-0 top-[12%]`. Two: `left-[9%] top-[3%]`, `left-[3%] top-[9%]`. One: `left-[6%] top-[6%]`. The brightness of the covers behind stays.

## Risks / Trade-offs

- [The front cover hides more of the covers behind] → the creator asked to keep them visible; a strip of each shows, dimmed as before.
