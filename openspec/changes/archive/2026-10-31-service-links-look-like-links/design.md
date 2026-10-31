# Design

## Context

Text links in Tonaris are `text-accent-solid` with an underline on hover, as in "Go to Collection" and on the sign-in pages. The album panel's service link was the one text link in `fg.primary`, so it read as a value, not a link.

## Decisions

### 1. The app's link colour, with a resting underline

The URL takes `accent.solid`. Its underline stays at 35% of that colour at rest and turns solid on hover, so the link is visible as one before the pointer reaches it. The text still truncates, with the full address as its title.

### 2. ↗, not the boxed arrow

Elsewhere the boxed arrow (`ExternalLink`) marks Open buttons, with no text beside them. Here an arrow follows link text, where ↗ (`ArrowUpRight`) is the familiar mark for "opens elsewhere". It is decorative: the link's name already says "Open in Spotify".
