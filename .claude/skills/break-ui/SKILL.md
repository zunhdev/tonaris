---
name: break-ui
description: Stress-test a Tonaris screen or component with realistic worst-case data (long or non-Latin album, artist and list names, counts of 0 and 1, missing artwork, the 5,000-album workload) at desktop and phone widths, then report what breaks with a fix for each. Use when asked to stress-test, break or find edge cases in UI, or to "try the worst case".
---

# Break the UI

Screens get built against kind data: "Nevermind" by Nirvana in a list called "Grunge". Real collections hold classical credits 400 characters long, Icelandic and Cyrillic names, a list with one album, and 5,000 albums in Unsorted. This skill feeds a screen those values, reports what breaks, and stops. It fixes only when asked.

## Rules

- **Plausible or at the limit, never random.** Each value is something a real person could save, or the longest value the domain accepts. The limits live in `packages/domain/src/limits.ts`: 1,000 code points for an album's title or artist credit, 200 for a folder, list, field or option name, and 2,000 for a description or a text value. A field with no limit is itself a finding.
- **Change the data, not the component.** Worst-case data goes in the way real data does: through the API, as a signed-in test account. Never edit markup or CSS to make a break happen.
- **Mix the failures across rows**, as real data does. Row 1 gets the long title, row 2 the long artist, row 3 the one-letter name. The first rows matter most, because they're on screen.
- **Report before fixing.** Some breaks are design decisions (wrap or truncate?). List them all, then stop.

## 1. Map what the screen shows

List every value the screen renders, with its source and limit: names, artists, years, counts, badges, field values, service links, artwork, timestamps, the owner's name on shared content, and the length of each list. Find each limit in the Zod schemas in `packages/domain/src` or in `limits.ts`.

**Done when** every rendered value has a source and a limit, or is marked unbounded.

## 2. Build the worst case

Pick values from [catalog.md](catalog.md). Put them in through a throwaway Playwright test in `apps/web/e2e/`, named `worst-case.tmp.e2e.ts`. It signs in with the helpers in `e2e/support/` (`signIn`, then `created` and `insert` in `workspace.ts`) and saves everything through the app or `POST /v1/mutations`, as the other tests do. For volume, sign in as `workload@tonaris.test` after `bun run seed:workload`: 5,000 albums in 250 lists and 60 folders.

Also cover what one dataset can't: an empty list, Unsorted and Trash; exactly one of everything ("1 album", "1 list"); and the largest realistic case.

## 3. Break it

Run the throwaway test alone: `bunx playwright test worst-case.tmp --project=chromium`, from `apps/web`. It screenshots each state with `page.screenshot()` at 1440 px, 412 px (a Pixel 7) and 320 px, set with `page.setViewportSize()`. It also takes one at 200 % zoom, through `page.evaluate(() => { document.documentElement.style.zoom = "2"; })`; the CSP allows styles set through the DOM. Look for:

| What you see | Usual cause | Fix |
| --- | --- | --- |
| Text runs past its box instead of wrapping or truncating | A flex or grid child with `min-width: auto` | `min-w-0` on the text column |
| The row's trailing button or menu is pushed off or clipped | The middle took all the space | `min-w-0` on the middle, `shrink-0` on the action |
| Artwork or an icon squeezed into an oval | A flex child shrinking | `shrink-0` on the fixed-size box |
| A count badge wraps onto two lines | The badge can shrink | `whitespace-nowrap shrink-0` on the badge |
| Truncated text with no way to read it | Ellipsis and nothing else | The full value in the inspector or a tooltip |
| "1 albums", "0 album" | A hand-made plural | `count()` in `apps/web/src/common/words.ts` |
| Diacritics clipped at the top or bottom | Tight line height with `overflow: hidden` | A looser line height, or no clipping |
| Numbers jump as they change | Proportional figures | `tabular-nums` |
| `<b>`, `&amp;` or `**` shown as text | Escaped twice | Escape once, at render |
| A long list stutters | Every row rendered | The virtualized grid (`album-grid.ts`) |

Decide per field whether to wrap or truncate. Wrap what identifies something (titles, names in the inspector). Truncate secondary text, with a way to see all of it. Truncate in the middle when items differ at the end. Never truncate numbers or dates.

**Done when** every catalog row that applies has been tried, at every width.

## 4. Report and stop

| # | Severity | Field | Worst-case value | What happens | Fix (`file:line`) |
| --- | --- | --- | --- | --- | --- |

Severity is **Broken** (unreadable, unreachable or wrong), **Ugly** (readable but visibly wrong) or **Fragile** (fine now, one realistic step from breaking).

Then add "Decisions for you" (one line each, with a recommendation) and "What held up". Say where the screenshots are. Keep the throwaway test until fixes are done. A break worth guarding becomes a real browser test; then delete the `.tmp` file.

*Adapted from Emil Kowalski's `break-ui` skill (MIT); see `../THIRD_PARTY_NOTICES.md`.*
