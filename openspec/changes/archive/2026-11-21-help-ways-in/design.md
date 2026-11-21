# Design

## Context

- Help is public at `/help`, with typed page names in `src/help/pages.gen.ts`, including each page's headings as literal types.
- The workspace keeps state a reload would lose: an open inspector, a selection, an unsent edit. The account menu already opens Terms and Privacy in a new tab.

## Goals / Non-Goals

**Goals:** a way into Help wherever people start; a link at each point people hesitate, to the section about it; links that can't silently break.

**Non-Goals:** Help inside the app's frame, tooltips or tours, links on every screen.

## Decisions

### 1. New tab from inside the app; same tab outside it

From the workspace, Help opens in a new tab, as Terms and Privacy do, so nothing in the workspace is lost. The landing page and sign-in have nothing to lose, so Help opens in place there.

### 2. Typed links, without carrying Help into the workspace

`helpAddress(page, heading)` takes a `HelpSlug` and that page's heading ids, read from `pages.gen.ts` with a type-only import. Renaming a page or heading fails `tsc` until the links follow, and the workspace bundle carries none of Help. A test with `@ts-expect-error` proves the check still bites.

### 3. Open help is a command without a key

It joins the command list, so ⌘K offers it and the `?` sheet and Help's own Keyboard shortcuts page list it. A phone offers it too; it changes nothing.

### 4. "Search help for '…'" comes last

In ⌘K, after the collection's results and commands: the reader came to search their collection, and Help is the fallback. "No results" still shows when only Help is offered.

### 5. "Learn more" says what it's about

The visible text is "Learn more"; a screen reader hears "Learn more about {topic}, in a new tab".

## Risks / Trade-offs

- **The sharing dialog's description** says viewers see custom fields, which TON-317 found isn't so; its link goes to Ways to share, which TON-317 will correct with it.
