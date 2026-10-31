# Design

## Context

The sidebar's header holds the wordmark (TON-114) and Hide sidebar. Collection, below Search and Add album, is already a link to `/c`.

## Decisions

### 1. One link around the mark and the name

The whole wordmark is the link, so the mark and the name are one target. Its name, "Tonaris, go to Collection", starts with the visible text, as WCAG's label-in-name asks, and says where it goes. It takes the sidebar rows' `hover:bg-hover` and focus ring, padded out to the left so the mark stays where it was.

### 2. Only in the workspace

Guests and people signing in have no collection, so their wordmarks stay text.
