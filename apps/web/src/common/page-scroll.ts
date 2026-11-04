// A page's own scroll containers (TON-157). TanStack Router's scroll restoration records each container's offset by
// its place in the page, and on a navigation copies it onto whatever sits in that place on the next page. A route
// whose params change also keeps its elements, offsets and all. So a list opened from a scrolled-down folder opened
// scrolled down. Each container that belongs to the page, rather than to the shell (the sidebar, a section's tabs),
// carries one of these marks, and the router (router.tsx) scrolls it to the top on every navigation to another page.
// Back and Forward still return it to where it was. A page has at most one of each, since the router finds each by
// its mark alone. The navigations that only open, switch or close the album panel leave scrolling alone
// (inspector-state.ts).

const pageScrollers = [
  // The main pane, which on desktop scrolls a page with no scroll area of its own, such as Account (TON-158). The
  // shell draws it, but what it scrolls is the page.
  "main",
  // The view: its rows or cards, or the page's body.
  "view",
  // A folder's or list's description, read or edited.
  "description",
  // The albums being added, above a list's rows.
  "captures",
  // The album panel.
  "album",
] as const;

type PageScroller = (typeof pageScrollers)[number];

/** The router's `scrollToTopSelectors`, the window's included. */
export const pageScrollSelectors = [
  "window",
  ...pageScrollers.map((name) => `[data-page-scroll="${name}"]`),
];

/** Spread on a page's scroll container. */
export const pageScroll = (name: PageScroller) => ({ "data-page-scroll": name });
