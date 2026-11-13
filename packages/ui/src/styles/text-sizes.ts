// The theme's text sizes (DS-13), as tokens.css declares them (`--text-small`), which replace Tailwind's own: the class
// merging needs their names, and the browser can't read tokens.css, so they are listed here and the token test checks
// the list against it. No size may share a color's name, or Tailwind reads its class as the color (TON-101).

export const textSizes = [
  "micro",
  "small",
  "base",
  "control",
  "title",
  "brand",
  "page",
  "display",
  "hero",
  "headline",
  "lead",
  "body",
] as const;
