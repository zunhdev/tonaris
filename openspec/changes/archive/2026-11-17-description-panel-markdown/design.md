# Design

## Context

`ContainerDescription` (`apps/web/src/features/collection/container-description.tsx`) shows the description above a view's scroll area, at most 96 px tall, and in Editing mode replaces it with an inline `useInlineDraft` text area. Shared and guest pages show it as a `whitespace-pre-line` paragraph. The album panel's slot is the shell's (`shell.tsx`), opened by `?album=` and slid by `inspector-slide.ts`.

## Decisions

- **One parser, in the domain.** `parseDescription` (`packages/domain`) turns the text into blocks (paragraphs, lists) and inline runs (text, strong, em, link). React renders that tree, so no HTML string is ever built from user text (TS-101); guest pages are React on the server too. Links take `http:` and `https:` only; anything else stays text. `descriptionExcerpt` gives the first line without its marks, for rows; `descriptionMarkdown` re-writes the tree as escaped Markdown for the export's readable copy, so only the supported marks render there.
- **Numbered lists start at 1 to 999.** A line such as "1994. The year…" stays text.
- **In the scroll area.** Each of the four scrollers (album cards and rows, folder cards and rows) takes a `lead` above its grid, and its virtualizer a `scrollMargin` of the lead's measured height; rows and cards place themselves at `start - scrollMargin`. An empty list or folder shows the description above its empty sentence.
- **Three lines and More.** The text is clipped at 60 px with a fade. More shows only when the text overflows, measured with a ResizeObserver; before that, on the server, a text over 180 characters or 3 lines assumes it does.
- **The panel shares the album panel's slot.** A `DescriptionPanelProvider` in the shell holds which container is described. The slot's subject is the description while that is set, else the album, so the slide, width and placement serve both. Opening one closes the other. The panel closes on leaving Editing mode, on a narrow screen, and when the page changes.
- **Saving.** The panel registers its commit with Editing mode, as inline editors do, so leaving Editing saves it, or stays while it is over 2,000 characters. Done, ⌘↵, Esc and the close button commit and close; over the limit they keep it open with the reason. Navigating away commits on unmount. The draft is shared through a small store, so the text under the header follows the typing without re-rendering the shell.

## Risks

- Existing descriptions with paired `*` or `_` turn italic. Closed beta, so few if any.
- Browser tests for descriptions move from the inline box to the panel.
