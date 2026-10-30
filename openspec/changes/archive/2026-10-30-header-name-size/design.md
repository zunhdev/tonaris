# Design

## Context

`PageHeader`'s desktop `h1` was `text-page` (20 px, 600). The breadcrumbs inherit the body's `text.base` (13 px) in `fg.secondary`.

## Goals / Non-Goals

**Goals:** the name at the breadcrumbs' size, still clearly the current place.

**Non-Goals:** the phone's top bar (DS-110), and full-page messages such as "Not available", which keep `text.page`.

## Decisions

### 1. Inherit the size, set the weight

The `h1` drops `text-page` and takes `font-medium` and `text-fg-primary`. Its size is the inherited `text.base`, the same as the crumbs. Weight 500 and the primary colour set it apart from the `fg.secondary` crumbs.
- **Alternative:** `text.title` (15 px, 600). The creator chose the same size.

## Risks / Trade-offs

- **[Trade-off] A top-level view's name,** such as Unsorted or Trash, has no crumbs beside it and is now small. → This matches Linear's headers. The view's own content says the rest.
