# Design

## Context

- TON-114 drew the mark in a near-square `viewBox` and sized `Logo` as a square (`size-5`, `size-7`). The new mark is wider than tall, so a square box would shrink it.
- `favicon.svg` and `icon-maskable.svg` repeat the mark's shapes; `scripts/render-icons.mjs` renders the PNGs from them and makes iOS's square icon by replacing `rx="7"`.

## Goals / Non-Goals

**Goals:** the chosen mark, drawn exactly, crisp from 16 px up; the same shapes everywhere.

**Non-Goals:** a light-theme variant, brand guidelines, a new type size.

## Decisions

### 1. The construction

On a 22.5 × 16 grid: the body is a 16-unit square with 2.5-unit corners. The disc, 16 units across like the body, is centred 14.5 units in, so it overhangs the body by 6.5. A 1.75-unit gap follows the disc's edge through the body, and where the gap meets the body's top and bottom edges the tips are rounded by 0.35 units. The hole is 2.75 units in radius with a 1.25-unit spindle in it.

The body is one path (the square minus the gap, with the rounded tips) and the disc another, with its hole and spindle by the even-odd rule. Plain paths, not a masked circle, so the inline component needs no generated ids.

Alternatives the creator saw: the sleeve with the disc sliding further out (too wide, weak at 16 px), the disc rising out of the sleeve's corner, a die-cut sleeve, an album grid, a T in the disc.

### 2. Sized by height

`Logo` takes the mark's own `viewBox` and aspect ratio, and the wordmark sets its height: 16 px beside `text.brand`, about the old mark's visible height, and 22 px beside `text.page`. The width follows, 22.5 and 31 px.

### 3. A little right of centre in the icons

The body's straight left edge carries more visual weight than the round disc on the right, so the icons place the mark 0.25 units (of 32) right of centre. The favicon scales it to 0.96 (about 22 × 15 units); the maskable icon scales it to 0.76, which keeps it inside Android's safe zone.

## Risks / Trade-offs

- **[The spindle ring is under 1 px at 16 px]** → At tab size it reads as a dot in the disc, which is fine; from 32 px up the ring shows.
