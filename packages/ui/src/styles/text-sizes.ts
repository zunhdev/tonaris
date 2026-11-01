// The theme's text sizes (DS-13), as tokens.css declares them (`--text-small`), which replace Tailwind's own: the class
// merging needs their names, and the browser can't read tokens.css, so they are listed here and the token test checks
// the list against it. `input` is left out: Tailwind reads `text-input` as the `input` color, shadcn's border token.

export const textSizes = [
  "micro",
  "small",
  "base",
  "title",
  "brand",
  "page",
  "display",
  "hero",
  "headline",
  "lead",
  "body",
] as const;
