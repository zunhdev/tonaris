# Design

## Context

DS-13's sizes are Tailwind 4 theme tokens (`--text-*` in `tokens.css`), and every `text-*` class and the body's text read them as CSS variables. Phones are below 768 px (DS-110's breakpoint, `narrowQuery`). Inputs already switch to 16 px there, which keeps iOS from zooming.

## Decisions

### 1. Redefine the tokens on phones

A `@media (max-width: 767px)` block sets the same variables at `:root`, outside Tailwind's theme layer, so it wins on phones and changes every use at once: no component changes, and desktop stays as it was.

### 2. The step

The creator chose a 15 px base over 14 (31 October 2026). Base goes up 2 px and the others follow: micro and small by 1, title, brand, page and display by 2. Line heights grow with them, so phone rows (56 and 48 px) still hold a title over a subtitle.
