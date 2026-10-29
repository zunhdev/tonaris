# Tonaris — Design spec

| | |
| --- | --- |
| Status | Draft v0.1 |
| Updated | 20 October 2026 |
| Source of truth for behavior | [Product requirements](product-requirements.md), iteration 6 |
| Companion | [Tech spec](tech-spec.md) |
| Decisions log | [Section 17](#17-design-decisions-log) |

This spec defines how Tonaris looks, reads, and behaves on screen: visual system, components, navigation, screens, interaction details, copy, and accessibility. Product behavior and permissions live in the PRD. Mechanisms such as sync protocol, storage, and auth flows live in the tech spec.

## How to read this document

- **IDs.** Each design decision is `DS-NN`. IDs are stable: they are never renumbered or reused. Numbers are grouped by section, with gaps left for additions.
- **Traceability.** Each decision cites the PRD rules it implements (`FR-`, `X-`, `Q-`). Linear issues and OpenSpec changes reference DS IDs alongside FR IDs, for example "Implements FR-01.16 via DS-56".
- **No restating.** PRD rules are cited, not repeated. If this spec and the PRD disagree, the PRD wins, and this spec gets fixed.
- **Open (design)** marks a choice that needs the creator's input. Section 17 logs every such question and its decision.
- **Shared state names.** The save states (*pending*, *confirmed*, *failed*, *conflict*, *unconfirmed*) and connection states (*connected*, *reconnecting*, *offline*) are a contract with the tech spec. Use these exact names in code, copy keys, and tests.

---

## 1. Principles

**DS-01 Local data answers first.** Every interaction reads from and writes to the client's local collection data immediately. The network works in the background. Navigation, sorting, grouping, and search never wait on a request after the initial load. *(Q-01, FR-09.3)*

**DS-02 Quiet success, loud trouble.** Confirmed saves are silent. Pending saves become visible only after a short delay. Failures and conflicts are prominent, specific, and actionable, and they never disappear on their own. *(FR-09.3, FR-13.1–FR-13.3)*

**DS-03 Keyboard first, pointer complete.** Every action is reachable by shortcut or the command palette. Every drag has a keyboard path. Every hover-only affordance has a focus equivalent. *(Q-02)*

**DS-04 Dense, calm, content-forward.** The chrome is neutral and low-contrast; artwork is the main source of color. Text is about 13px, controls are compact, and every element earns its place. *(Q-10)*

**DS-05 Undo where recoverable, confirm where required.** Actions that land in Trash and are not required to be confirmed use an undo toast. Actions the PRD marks as *confirmed* use the standard confirmation dialog (DS-28). Irreversible account-level actions add typed confirmation. *(X-07, FR-01.11)*

**DS-06 Honest status.** The interface never implies success, privacy, or availability it cannot vouch for. It names who can see things, what will happen, and what is still unconfirmed. *(FR-13.3, FR-07.14, FR-06.8)*

**DS-07 One system, two surfaces.** Desktop is the full workspace. Mobile web is a browsing surface built from the same components, with edit chrome left out rather than shown disabled. *(Section 2.2, X-04)*

---

## 2. Foundations: tokens and theming

**DS-10 Token architecture.** There are three token layers, defined as CSS variables through Tailwind v4 `@theme`:

1. **Primitives:** OKLCH color ramps, a size scale, and durations.
2. **Semantic tokens:** `bg.*`, `fg.*`, `border.*`, `accent.*`, `status.*`, `focus`.
3. **Component tokens**, used only where a component needs its own value.

Components consume semantic tokens only, never primitives. *(Q-10)*

**DS-11 Dark-only v1, light-ready.**
- The root element carries `data-theme="dark"` and `color-scheme: dark`.
- A future light theme only remaps the semantic layer. No component changes.
- No theme switcher ships in v1.
- Artwork and status colors are tested against dark surfaces only for now.

*(Q-10)*

**DS-12 Color.** The neutral ramp is cool-tinted at hue ≈ 265 with chroma ≤ 0.012. These were starting values, tuned in implementation against the contrast targets in DS-14; the tuned values below are the ones in `packages/ui/src/styles/tokens.css` (18 October 2026).

| Semantic token | Value (OKLCH) | Use |
| --- | --- | --- |
| `bg.app` | 0.155 0.006 265 | Window background, sidebar |
| `bg.panel` | 0.185 0.007 265 | Main content, inspector |
| `bg.raised` | 0.215 0.008 265 | Popovers, menus, dialogs, palette |
| `bg.hover` | 0.235 0.008 265 | Row and item hover |
| `bg.selected` | 0.26 0.03 275 | Selected row (tinted toward accent) |
| `border.subtle` | 0.25 0.008 265 | Dividers, row separators |
| `border.strong` | 0.52 0.01 265 | Inputs, focused containers (raised from 0.32 to reach 3:1, DS-14) |
| `fg.primary` | 0.95 0.004 265 | Titles, primary text |
| `fg.secondary` | 0.76 0.008 265 | Artist, metadata |
| `fg.tertiary` | 0.64 0.01 265 | Hints, timestamps, placeholders |
| `fg.disabled` | 0.46 0.008 265 | Disabled controls only |
| `fg.on-accent` | 0.98 0 0 | Labels on `accent.fill` (primary buttons) |
| `accent.solid` | 0.66 0.17 275 | Focus ring (`focus`), selection marks |
| `accent.fill` | 0.54 0.17 275 | Primary button backgrounds; dark enough for `fg.on-accent` labels at 4.5:1 |
| `accent.soft` | 0.66 0.17 275 / 12% | Accent backgrounds, live-update flash |
| `status.success` | 0.72 0.15 155 | Confirmed outcomes in reports |
| `status.warning` | 0.80 0.14 80 | Conflicts, reconnecting, pending-approval notices |
| `status.danger` | 0.66 0.19 25 | Failures, destructive actions |
| `status.info` | 0.72 0.11 240 | Neutral notices |

- The accent hue is a cool violet-indigo (decided 17 October 2026).
- No service brand colors appear anywhere: services are named in text (DS-19).

**DS-13 Typography.**
- **Font.** Inter Variable, self-hosted woff2. Fallback stack: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif`. The system fallback renders saved text in scripts Inter doesn't cover, such as CJK. *(Section 2.3)*
- **Numerals.** `font-variant-numeric: tabular-nums` for years, counts, dates, and expiry countdowns.
- **Bidirectional text.** Saved user text is rendered with `dir="auto"`.

| Token | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| `text.micro` | 11 / 16 | 500 | Badges, key hints, group counts |
| `text.small` | 12 / 16 | 400–500 | Secondary metadata, table headers |
| `text.base` | 13 / 20 | 400–500 | Default UI text, rows, menus |
| `text.input` | 14 / 20 | 400 | Form inputs; 16 on mobile to prevent iOS zoom |
| `text.title` | 15 / 22 | 600 | Section titles, dialog titles |
| `text.page` | 20 / 28 | 600 | Page headers (list/folder name) |
| `text.display` | 28 / 34 | 600 | Guest page title, empty-state headline |

**DS-14 Contrast targets.** Contrast is checked by an automated token test (`packages/ui/src/styles/tokens.test.ts`). It reads `tokens.css`, converts OKLCH to sRGB, blends translucent tokens over their background, and fails naming each pair below its minimum. It checks `fg.primary`, `fg.secondary` and `fg.tertiary` at 4.5:1; `border.strong`, `focus` and every `status.*` at 3:1; and `fg.on-accent` on `accent.fill` at 4.5:1, all against the four surfaces below.

| Element | Minimum ratio | Against |
| --- | --- | --- |
| All informational text, including `fg.tertiary` | 4.5:1 | its actual background (`bg.app`, `bg.panel`, `bg.raised`, `bg.hover`) |
| UI component boundaries (input borders, focus ring) and status icons | 3:1 | adjacent colors |
| `fg.disabled` | exempt | — |

*(Q-02)*

**DS-15 Spacing, sizing, radius.**
- **Spacing:** 4px base, using the scale 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Control heights:** 24 for inline chips and key hints, 28 for the default (toolbar buttons, menu items, sidebar items), 32 for form inputs and dialog buttons.
- **Rows:** desktop album rows are 36px; mobile rows are 56px.
- **Touch targets** are at least 44×44px on mobile.
- **Radius:** 4 for chips, artwork, and checkboxes; 6 for buttons and inputs; 8 for popovers, menus, and cards; 12 for dialogs, sheets, and the palette.

**DS-16 Elevation.**
- Surfaces separate by lightness step plus a 1px border.
- Shadows appear only on floating layers (popover, menu, dialog, palette, toast), as a single soft shadow at `0 8px 24px oklch(0 0 0 / 40%)` plus a 1px `border.subtle` ring.
- Nothing else in the main layout casts a shadow.

**DS-17 Motion.**

| Duration | Use |
| --- | --- |
| 100ms | hover, press, toggles |
| 150ms | popovers, menus, tooltips, row insert and fade |
| 200ms | dialogs, sheets, inspector slide |
| 1,200ms | live-update highlight fade (DS-82) |

- Easing is `cubic-bezier(0.2, 0, 0, 1)` for enter and `cubic-bezier(0.4, 0, 1, 1)` for exit.
- Reordering lists never animates more than 150ms.
- Under `prefers-reduced-motion: reduce`, movement and scale transitions become opacity-only or instant, and the live-update highlight becomes a static 1.2s tint.

*(Q-02)*

**DS-18 Layers (z-index).** base 0 · sticky headers 10 · sidebar resize handle 20 · dropdowns, popovers, and context menus 40 · inspector overlay (narrow screens) and sheets 50 · dialogs 60 · command palette 70 · toasts 80 · tooltips 90.
- *As built in TON-67:* a dropdown opened from inside a dialog takes the dialog's layer (`DropdownMenuContent inDialog`). Its portal comes after the dialog's, so it stacks above.

**DS-19 Iconography.**
- **Lucide** at 16px with a 1.5 stroke; 14px inside dense rows and chips. It is consistent, tree-shakable, and matches the shadcn defaults.
- **Services are named in plain text**: "Spotify", "Apple Music", "Qobuz", "Tidal". No logos, badges or brand colors (decided 19 October 2026, [G1 terms review](spikes/2026-10-19-g1-terms-review.md); Tidal added 20 October 2026, [Tidal spike](spikes/2026-10-20-g1-tidal.md)): Spotify forbids pairing its brand with others', Apple allows only its own badge artwork, Qobuz's logo needs its consent, and Tidal's marks belong to its developer program, which Tonaris doesn't use. No provider-sourced content needs attribution (G1).
- Release types are written as text, not icons.
- **Branding:** a text wordmark, "Tonaris" in Inter semibold. The favicon and app icon are a "T" mark on the accent color.

---

## 3. Components

**DS-20 Base layer.**
- Use the shadcn CLI v4 **TanStack Start template with Base UI primitives**. Components are copied in and restyled to DS-10 to DS-19.
- Never introduce an unstyled third-party component without wrapping it in the system.
- Supporting libraries:
  - **Base UI's Dialog, with a combobox and listbox of our own,** for the command palette. cmdk was named first, but it filters and orders results itself, and doesn't virtualize, so "Show all" could render thousands of rows (changed in TON-61);
  - **Base UI's Toast** for toasts. Sonner was named first, but it injects its stylesheet as a `<style>` element without the CSP nonce, which TS-101 blocks (changed in TON-31);
  - **TanStack Virtual** for long collections;
  - **dnd-kit** for drag-and-drop (it has a keyboard sensor);
  - **react-day-picker** for date fields.

*(Q-10, Q-02)*

| Need | Base component | Tonaris adjustments |
| --- | --- | --- |
| Actions | Button, Toggle, ToggleGroup | Sizes 24/28/32; variants: primary, secondary, ghost, danger |
| Text entry | Input, Textarea | Inline-edit variant with no border until hover or focus |
| Choices | Select, Combobox, Checkbox, RadioGroup, Switch | Combobox supports multi-select chips |
| Overlays | Popover, DropdownMenu, ContextMenu, Tooltip | Menus at 28px rows with shortcut hints (`Kbd`) |
| Dialogs | Dialog, AlertDialog | The standard confirmation dialog (DS-28) is built on AlertDialog |
| Mobile overlays | Drawer / Sheet (bottom) | Service chooser, view options, album detail on mobile |
| Feedback | Toast, Skeleton, Progress, Badge | See DS-80 to DS-84 |
| Navigation | ScrollArea, Tabs, Separator | Tabs in Settings and Admin only |
| Palette | Dialog + combobox/listbox (`CommandDialog`) | See DS-75 |

**DS-21 Album row.** This is the desktop list item: 36px high and virtualized. Columns, in order:

1. selection checkbox (editing mode, DS-44);
2. drag handle (editing mode with manual sort only);
3. 28px artwork;
4. title;
5. artist credit (`fg.secondary`);
6. chronology year (tabular, DS-24);
7. release type in text (`fg.tertiary`; hidden when grouped by type);
8. the services the album has links for, by name in `fg.tertiary`, comma-separated and truncated with an ellipsis (DS-19);
9. a trailing save-state slot (DS-80).

On hover or focus a trailing "Open" button appears; it opens the service chooser (DS-25). Columns collapse from the right as the width shrinks: type, then services. *(FR-05, FR-06.5, FR-09.3)*

*As built in TON-34:*
- **Columns:** artwork with the title, artist, year, type and status.
- **Narrowing:** the type collapses below 640 px of view width.
- **Later columns:**
  - the checkbox (TON-37);
  - the drag handle (TON-36);
  - the services, and the Open button (M4).
- **The year** shows the original year, or a live recording range ("1978–1982").
- **Save states:** the status cell holds the save-state marker. The row is `aria-busy` while saving, and highlighted when changed elsewhere (DS-80, DS-82, DS-83).

*As built in TON-47:*
- **Services:** after the type, "Spotify, Tidal" in `fg.tertiary`, truncated, in the services' order. The column shows from 760 px of view width and the type from 640 px, so the services collapse first.
- **Open:** an icon button in the status cell, beside the save marker, for albums with links. It shows on the row's hover or focus, and always on touch screens. It is pointer-only; `O` is its keyboard path. Its name is "Open '{title}' in…".

*As built in TON-35:*
- **The year** follows DS-24, in a 7 rem column to fit "rec. 1978–1982".
- **Grouped by release type,** the type column is hidden.
- **Order:** the view's sort (DS-49), with DS-44's first-time default of chronological ascending.

*As built in TON-36:*
- **The drag handle** shows under Manual sort only, on the row's hover or keyboard focus. It sits in the gutter left of the row, not in a column, so the grid's shape stays the same.
  - Decided with the creator on 23 October 2026: handles show in Viewing mode until TON-37, which shows them only in Editing (DS-45).
  - It is pointer only and hidden from assistive technology. ⌥↑ and ⌥↓ do the same from the keyboard (DS-03).
- **Folder and root rows** have the same handle (DS-41).

*As built in TON-37:*
- **Drag handles show in Editing mode only,** under Manual sort. In Viewing mode, ⌥↑ and ⌥↓ still rearrange.
- **In Editing mode, the title, artist and year cells edit inline:**
  - **Opening:** Enter on the cell, or a double-click. F2 opens the title from either mode, switching to Editing first.
  - **The year** edits what the cell shows: the original year; a live album's recording year or range, "1978–1982" with any dash; or, for a live album without one, the release year it falls back to.
  - **Saving:** Enter or leaving the field saves, as one `album.update` from the replaced values (TS-21). Escape discards.
  - **Refusals** stay in the field, under the cell, and nothing is sent:
    - "Give the album a title.";
    - "Give the album an artist.";
    - "Give the album a year.";
    - "Enter the year as four digits, such as 1986.";
    - "The recording period ends before it starts."
  - **Offline,** cells don't open (DS-81).
  - **Cards** aren't edited inline; the inspector will edit them (TON-38).

**DS-22 Album card.** This is the grid item. A square artwork tile (160–200px, responsive columns) sits over the title and artist, each truncated to one line, then the year. Save state appears as a corner badge. *(FR-05)*

*As built in TON-34:*
- **Sizes:** cards are at least 160 px wide, 16 px apart, and fill the row. They are about 200 px or less from 360 px of view width up.
- **Virtualized by rows of cards.**
- **Each card is a grid cell,** named by its title, artist and year. The save-state badge sits on the artwork's top-right corner.

*As built in TON-35:* the year follows DS-24, as in rows. Grouped, each group's header is a row of its own above its cards (DS-43).

**DS-23 Artwork.**
- A fixed-aspect box with lazy loading, `decoding="async"`, a `sizes`/`srcset` where the source allows it, and a 150ms fade-in.
- **Fallback tile:** a neutral surface with the first letter of the title and a hue derived from a hash of the title, desaturated to stay calm. The same tile is used when artwork is missing, still loading, or fails to load. A failed load is never shown as an error. *(FR-03.4)*
- **Alt text:** decorative (`alt=""`) in rows and cards, where the title is adjacent; "Cover of {title}" in the inspector and on guest album sheets.

*As built in TON-34:*
- **The tile:**
  - the title's first grapheme, upper-cased;
  - its hue is a 32-bit FNV-1a hash of the title, modulo 360;
  - its colors are a calm, low-chroma OKLCH ground (L 0.33, C 0.04) with the letter at L 0.86;
  - a blank title gets a neutral tile.
- **Images** load lazily, fade in over 150 ms once loaded, and on error leave the tile.
- **Albums carry no artwork yet** (capture, M3), so every album shows its tile.

*As built in TON-48:*
- **Artwork shows through the API's image proxy** (TS-103), in rows, cards and the inspector, once the server has signed the album's URL. The browser never contacts the artwork's host.
- **The inspector names it "Cover of {title}";** rows and cards keep it decorative.
- **A failed load removes the image and keeps the tile.** Replaced artwork loads afresh.

**DS-24 Chronology display.** *(FR-05.5, FR-05.6, FR-02.8)*

| Case | Display |
| --- | --- |
| Non-live release | Original release year, e.g. `1994` |
| Live, recording year known | Year or full range, e.g. `1978–1982`, with a small `rec.` prefix in `fg.tertiary` |
| Live, recording year unknown | Release year with a fallback marker, e.g. `1979 ·` plus a "release-year fallback" glyph; tooltip and accessible label: "Recording year unknown — sorted by release year" |

A reissue's release date never appears in the year column. Tonaris saves albums, not editions (FR-02.12).

*As built in TON-35:*
- **`rec.`** is `text.small` in `fg.tertiary`, before the year or range.
- **The fallback marker** is "·" and a calendar-clock glyph in `fg.tertiary`, after the release year.
  - Its tooltip says "Recording year unknown — sorted by release year".
  - So does visually hidden text, so the year cell reads "1979 · Recording year unknown — sorted by release year" to assistive technology.
- **An unknown year** shows "—" and sorts last in both directions. Saved albums always have a year (FR-02.6), so only damaged data shows it.

**DS-25 Service-link chooser.** "Open in…" lists only the services that have a link, each by name in plain text ("Open in Spotify"), with no logos (DS-19).
- **Desktop:** a popover anchored to the Open button or invoked with `O`. The first item is focused, and Enter opens it.
- **Mobile:** a bottom sheet.
- **No preselection** and no remembered choice. *(FR-06.5)*
- **Single link:** the popover still appears, with one item. This keeps the explicit choice consistent.
- **Failure:** if neither the app nor the web destination can open, an inline message replaces the item list (DS-107). *(FR-06.6)*

*As built in TON-47:*
- **The popover** reads "Open in…", with the album's title under it. Each linked service has "Open in Spotify", which opens its page in a new tab and closes the popover, and "App" beside it ("Open in the Spotify app"), which opens the desktop app (TS-43).
- **After App:** if the page keeps the focus for 2 s, the list gives way to "If the Spotify app didn't open, it may not be installed on this computer.", with **Open Spotify on the web** and **Back**. The popover closes as soon as the app takes the focus.
- **The bottom sheet,** on narrow screens, has full-width "Open in Spotify" links to the canonical URLs, which the services' apps take when installed. It has no App choice.
- **It opens from** a row's Open button, and `O` (DS-78), anchored to what has the focus. An album without links has no Open button, and `O` says "'{title}' has no links to open."
- **Cards** have no Open button yet; `O` works on them.

**DS-26 Field editors (custom fields).** One editor per type, used in the inspector and the manual-entry form. *(FR-03.6, FR-03.7, FR-03.10)*

| Type | Editor | Empty state |
| --- | --- | --- |
| Text | Inline single-line input that expands to multi-line on Shift+Enter | `Empty` placeholder |
| Number | Numeric input, any valid number, no locale grouping on entry | `Empty` |
| Date | Text input accepting `YYYY-MM-DD`, plus a calendar popover | `Empty` |
| Yes/no | Three-state segmented control: `Yes · No · —`, where `—` means applied-empty | `—` selected |
| Single choice | Select including a "Clear" item | `Empty` |
| Multiple choice | Combobox with chips, no repeats | `Empty` |

- Applied fields always render a row in the inspector, even when empty.
- Unused fields are absent. They are added through the "+ Add field" menu and removed with the row's × button (FR-03.8).
- Invalid input keeps the editor open with an inline error, and the value is not saved (X-05).

*As built in TON-50:*
- **Text, number and date** save on Enter or when left; Escape discards. Text grows a line with each Shift+Enter. The date's "Pick a date" button opens the browser's own calendar.
- **The reasons:**
  - "Enter a number, such as 4.5.";
  - "Enter a date as YYYY-MM-DD, such as 2026-10-28.";
  - "Text can be at most 2,000 characters.";
  - "Choose one of the field's options." and "Choose each option once."
- **Yes/no, single and multiple choice** save as chosen.
  - The single choice's first item reads "Empty" when empty, else "Clear".
  - The multiple choice shows its chips in the field's option order, each with "Remove {option}", and an "Add option" select of the rest.
- **Viewing mode** shows "Empty", `—` for an empty yes/no, Yes or No, and options by label, comma-separated.

**DS-27 Tree navigation.**
- The sidebar tree follows the ARIA `tree` pattern with roving tabindex. ←/→ collapses and expands, ↑/↓ moves, and Enter opens. Type-ahead jumps to an item by name.
- Folders show a disclosure chevron. Lists show an album count in `fg.tertiary`.
- Shared containers carry a small sharing glyph (DS-31).
- Drop targets highlight with `accent.soft` during drags (DS-49).
- Expansion state is per device and is not synced.

*As built in TON-33:*
- **One flat tree.** One ARIA tree labelled "Collection" holds the folders and lists, then Unsorted, Shared with me and Trash. Each item carries its level, position and set size, rather than nested groups.
- **Items are links,** so Enter and a click open the view, and a view can open in a new tab.
- **Order.** Siblings come in creation order, DS-44's fallback, until manual order (TON-36).
- **Selection and focus.** The current view's item is selected, and its folders are expanded. There is one tab stop.
- **Keys:**
  - ↑ and ↓ move, and Home and End jump;
  - → expands a folder or enters it, and ← collapses it or goes to its parent;
  - Enter opens.
- **The chevron** is for the pointer only.
- **Type-ahead** waits 700 ms between letters, ignoring case and accents.

*As built in TON-36:*
- **Order:** each level follows its folder's arrangement, and the top level the root's (TS-16). Unarranged items are in creation order.
- **Dragging:** a folder or list in the tree can be dragged onto a folder, or onto Collection above the tree, to move it (DS-49). A press that moves less than 6 px is still a click.
- **Drop targets** highlight with `accent.soft`. Only places that can take the item accept it: not the item itself, anything under it, a list, or where it is already, and nothing while offline.
  - Letters that are shortcuts act as shortcuts instead (DS-78; decided with the creator on 22 October 2026).
  - Names starting with one are reached with the arrows, or ⌘K search once it exists.
- **Counts:** lists and Unsorted show their album count, which screen readers hear as "Doom 2 albums".
- **Save states:** each folder or list shows its save-state marker, is `aria-busy` while saving, and is highlighted when changed elsewhere (DS-80, DS-82, DS-83).
- **Expansion** is kept in `localStorage`, per account.
- **Creating and renaming** happen in an inline editor in the tree:
  - **F2** renames the focused folder or list;
  - **N** and **⇧N** make a list or a folder inside the focused folder, the current view's, or the root;
  - **Enter** saves, **Escape** cancels, and leaving the field saves a name or cancels a blank one;
  - **A refused name** (blank, over 200 characters, or taken among its siblings) keeps the editor open with the domain's reason, and nothing is sent.

*(FR-01.1, FR-01.3, Q-02)*

**DS-28 Standard confirmation dialog.** Built on AlertDialog. It is used for every *confirmed* operation (X-07). *(X-07, FR-07.14)*

1. **Title:** the verb and target, e.g. "Delete folder 'Metal'?"
2. **Scope block:** a bulleted summary with counts; long lists are expandable.
3. **Consequences block:** what stays (albums remain in other lists or Unsorted), sharing effects through `SharingImpact` (DS-69), and recoverability ("Recoverable from Trash for 30 days" or "This can't be undone").
4. **Buttons:** Cancel (default focus for irreversible actions) and a primary button naming the action and scope, e.g. "Move 1 folder and 6 lists to Trash". The primary button uses the danger variant when the action is irreversible.

Typed confirmation is reserved for account deletion (DS-97).

*As built in TON-53:* `ConfirmDialog` takes a title, scope lines, consequence lines, an action label and what to do on confirming. Cancel has the focus; the action uses the danger variant; Escape cancels. Removing a used option and deleting a field use it (DS-60).

**DS-29 Other Tonaris components.**

| Component | Purpose | Rules |
| --- | --- | --- |
| `Breadcrumbs` | Location path in the view header | Shared content shows only accessible ancestors, starting at the shared root with "Shared by {name}" (FR-12.3, FR-01.3) |
| `EmptyState` | Empty views | Icon, one-sentence explanation, one primary action (DS-105) |
| `SyncIndicator` | Global save and connection status | DS-81 |
| `SaveStateMarker` | Per-item pending, failed, conflict, or unconfirmed | DS-80 |
| `ConflictView` | Current vs attempted values | DS-80 |
| `BatchOutcomeReport` | Multi-item results | DS-84 |
| `SharingDialog` | Invitations, link, access list | DS-65 |
| `SharingImpact` | Effective-sharing preview | DS-69 |
| `UsageMeter` | Album capacity | DS-98 |
| `KeyHint` / `Kbd` | Shortcut hints in menus and tooltips | macOS ⌘ glyphs; Ctrl on other platforms |
| `UndoToast` | Reversible actions | DS-50 |

---

## 4. Information architecture and navigation

**DS-30 Desktop shell.** A three-pane, Linear-style layout:

```
┌───────────────┬──────────────────────────────────────────┬────────────────────┐
│ Account ▾  ⌘K │ Metal › Doom            [View] [Share] … │ (Album inspector)  │
│ + Add album   │──────────────────────────────────────────│  artwork           │
│               │  ▣ Title  (2010 remaster)  Artist  1994  │  title / artist    │
│ COLLECTION    │  ▣ Title                   Artist  1996  │  chronology        │
│ ▸ Metal       │  ▣ …                                     │  links             │
│   ▸ Doom      │                                          │  fields            │
│   ≡ Favorites │                                          │  lists             │
│ ≡ To listen   │                                          │                    │
│ Unsorted   12 │                                          │                    │
│ SHARED WITH ME│                                          │                    │
│ ▸ Anna        │                                          │                    │
│ Invitations 1 │                                          │                    │
│ Trash      3  │                                          │                    │
│ ● Saving…     │                                          │                    │
└───────────────┴──────────────────────────────────────────┴────────────────────┘
```

| Pane | Width | Behavior |
| --- | --- | --- |
| Sidebar | 240px (resizable 200–360) | Collapsible with `[` |
| Main view | flexible | — |
| Inspector | 380px | Opens on demand (DS-46). Below 1100px wide it overlays the main view instead of splitting. |

*As built in TON-33:*
- **Resizing.** The sidebar's right edge is a window splitter. Drag it, or focus it and use ← and → (16 px a step), Home and End.
- **Hiding.** A button in the sidebar's header hides it, as `[` does. "Show sidebar" in the view's header brings it back. Hiding the sidebar also hides the SyncIndicator, and problems still raise toasts.
- **Kept per device:** the width and whether the sidebar is hidden.
- **The view's header** shows the breadcrumbs (DS-29), then the view's name as its heading.

*As built in TON-38:*
- **The inspector** takes a third column, 380 px wide, when the window is at least 1100 px. Below that, it is a panel over the view's right edge, with the floating shadow. It is a landmark named "Album".

*(FR-01.3, FR-12.2)*

**DS-31 Sidebar contents, top to bottom.** *(FR-01.9, FR-01.12, FR-07.6, FR-07.13, FR-11.6, FR-12.2)*

1. **Account menu:** display name or email, Settings, Admin (creator only; since TON-74), keyboard shortcuts, Sign out.
2. **Search**, labelled with ⌘K.
3. **+ Add album.**
4. **Collection:** the root's folders and lists in the owner's root order.
5. **Unsorted**, with count.
6. **Shared with me:** references grouped under each owner's display name. Invitation-based and link-saved references show distinct glyphs.
7. **Invitations**, visible only when pending invitations exist, with a badge.
8. **Trash**, with count.
9. **Footer:** the SyncIndicator.

Shared containers in the user's own collection carry a sharing glyph: people, link, or both. Inherited sharing uses a dimmer glyph variant.

*As built in TON-33:*
- **Collection** is a heading link to the root, with a "+" menu: New list (N) and New folder (⇧N). Offline, the menu is disabled with "You're offline" (DS-81).
- **Below the folders and lists,** the tree shows Unsorted with its count, then Shared with me and Trash, as placeholders until M7 and M5.
- **Invitations** waits for sharing (M7).
- **The account menu** has Keyboard shortcuts, which opens the reference (DS-78).

*As built in TON-35:*
- **The tree follows each level's sort** (decided with the creator on 23 October 2026): a folder's contents in the order its view is sorted, and the top level in the root's. "The owner's root order" is the root's presentation, so the tree and the view beside it always agree. In manual order, the default, both show the arrangement.
- **The account menu's "Connections"** became **Settings**, which opens Settings → Preferences (DS-92).

*As built in TON-38:*
- **+ Add album** opens the manual entry form (DS-47) until capture arrives (M3), switching to Editing first. Offline, it is disabled with "You're offline" (DS-81).

*As built in TON-66:* **Invitations** is a tree place between Shared with me and Trash, with an envelope icon and the pending count ("2 pending invitations" to screen readers). It shows only while invitations are pending. Another account's invitation can't reach this client's stream, so the count is read on load, when the window regains focus, every minute, and after an answer.

**DS-32 Route map.** These are conceptual paths; final paths are decided in the tech spec. *(Section 2.2)*

| Path | Screen |
| --- | --- |
| `/` | Redirects to the last visited collection view, or `/c` |
| `/c` | Collection root |
| `/f/:folderId`, `/l/:listId` | Folder or list. Owners and signed-in viewers with access use the same paths; access is checked server-side. |
| `/unsorted`, `/trash` | Unsorted, Trash (Trash is desktop only) |
| `/a/:albumId` | Album deep link. Opens the inspector over the last view, or a standalone page when entered directly. |
| `/shared` | Shared with me index |
| `/invitations`, `/invitations/:id` | Sharing invitations inbox and detail (landing from email) |
| `/s/:linkToken` (+ `/f/:id`, `/l/:id` below it) | Guest and link-shared view (SSR) |
| `/settings/{profile,account,preferences,fields,connections,data}` | Settings |
| `/admin/admissions` | Creator admin |
| `/approvals/:id` | MCP approval |
| `/oauth/consent` | MCP connection consent |
| `/sign-in`, `/sign-in/verify` | Sign-in; the email link lands on `/sign-in/verify` with the code (TS-70) |
| `/join/:admissionToken` | Admission landing |
| `/help/recovery` | Lost-email help |

Presentation choices are not in the URL; they are personal synced preferences (FR-11.8). Selection and the open inspector may be reflected in the URL for deep-linking (`?album=:id`).

*As built in TON-33:*
- **The routes so far:** `/`, `/c`, `/f/$folderId`, `/l/$listId`, `/unsorted`, `/trash` and `/shared`. The others come with their issues: `/a/…` (TON-38), `/invitations` and `/s/…` (M7), and the rest of Settings, `/admin`, `/join` and `/help` (M8).
- **`/`** runs in the browser. It opens the collection view last visited on the device, per account, or `/c`.
- **The wrong kind.** A folder's path given a list's ID leads to the list's path, and the other way round.
- **A missing folder or list** reads "This folder or list isn't available.", with "Go to your collection".
- **Page titles** are "{name} · Tonaris".
- **TON-35 adds `/settings/preferences`.** G then S goes there, the first settings page built in DS-92's order.
- **TON-38 adds the inspector and `/a/$albumId`:**
  - **`?album={id}`** opens the inspector on any workspace view; a value that isn't an ID is dropped.
  - **`/a/$albumId`** shows the album's details on a page of its own, titled with its name, with View and Edit. A missing album reads "This album isn't available.", with "Go to your collection".
  - **Links inside the app** open the inspector over the current view, not the page.

---

## 5. Collection views

**DS-40 Layouts.**
- Lists and Unsorted offer **Rows** (default) and **Grid**. Folders and the root always use rows.
- The layout choice is saved with the view's other personal presentation choices.
- Both layouts ship in v1 and are built together from the start (decided 17 October 2026).

*As built in TON-34:*
- **The switch:** a Rows | Grid control in the header of lists and Unsorted.
- **Kept per view on the device** (decided with the creator on 22 October 2026), until TON-35's View options make it a synced preference.
- **Folders and the root** show rows only.
- **A grid for every layout.** Each is a virtualized ARIA grid that states its full row count (and, for cards, its column count), with a hidden header row for rows.
- **Keyboard:**
  - focus moves cell by cell with the arrows;
  - J and K go to the next and previous row;
  - Home and End go to the row's ends, and ⌘Home and ⌘End to the grid's;
  - Page Up and Page Down move by a page.
- **Measured:** at 5,000 albums, both layouts scroll at the display's rate (120 Hz on the test Mac), with no frame over 17 ms.

*As built in TON-35:*
- **The layout is chosen in View options** (DS-49) and saved with the view's other choices to the account, so it follows the person to every device. The header switch is gone.
- **Layouts kept on the device move to the account.** The first time the workspace loads, each list or Unsorted kept as Grid on the device since TON-34 is saved as Grid, unless it chose a layout meanwhile. Then the device forgets them.

*(FR-05.2)*

**DS-41 Folder and root rows.** Each row shows the container icon (folder or list), name, a description excerpt (`fg.tertiary`, one line), the item count (albums for lists, children for folders), and a sharing glyph. When sorted by creation date, a date column appears. *(FR-01.3, FR-03.5, FR-05.1)*

*As built in TON-34:*
- **The cells:**
  - the name cell, a link with the icon, name and save-state marker;
  - the contents cell: "2 albums", or "3 folders and lists".
- **Enter** opens the folder or list from either cell.
- **Later:** descriptions (M4) and sharing glyphs (M7).

*As built in TON-54:*
- **Rows:** a description's first line follows the name in `fg.tertiary`, truncated. The name takes at most 60% of the cell, and the link is described by it (`aria-describedby`).
- **Under a folder's or list's header:**
  - **Viewing mode:** the description, its line breaks kept, scrolling past about four lines.
  - **Editing mode:** a borderless text box with the placeholder "Add a description". Enter or leaving it saves; Shift+Enter adds a line; Escape reverts; emptied, it clears. Over 2,000 characters it stays, with "Descriptions can be at most 2,000 characters."

*As built in TON-35:*
- **Order:** the view's sort (DS-42), the same as the tree's.
- **Created:** sorted by creation date, a Created column between the name and the contents shows each one's date, in the browser's medium date style ("Oct 23, 2026"). The date comes from the folder's or list's UUIDv7 ID, made when it was created (TS-10).

**DS-42 Lists and folders under each sort** *(handoff FR-05.1)*:
- **Name and creation-date sorts:** folders first, then lists, each sorted by the selected key and direction. This is the filesystem convention and keeps hierarchy scannable.
- **Manual sort:** one mixed sequence in the person's arrangement.

*As built in TON-35:*
- **Albums:**
  - **Year** uses FR-05.5's chronological year.
  - **Name** sorts by title, ignoring case and accents (the domain's `searchKey`), ties by artist.
  - **Ties** then go by title, then ID, ascending in either direction, so the order never shifts.
- **Folders and lists:** Name sorts by name, ignoring case and accents. Created sorts by when each was made, as its UUIDv7 ID holds.

**DS-43 Group sequence and headers** *(handoff FR-05.7)*:
- Sequence: **Album → EP → Live → Compilation → Unclassified.** Core studio work comes first and unknowns last.
- Sticky 28px headers show the group name and count (`text.small`, `fg.secondary`).
- Empty groups are hidden.
- Groups can be collapsed per session; collapse state is not synced.

*As built in TON-35:*
- **Each header is a grid row** with one cell spanning the columns. The cell holds a button with a chevron, the group's name and its count ("Live 2", read as "Live 2 albums"), and `aria-expanded`. Enter or Space collapses or expands the group.
- **Sticky:** the header of the group in view stays at the top as the view scrolls, on the panel's surface. The others scroll with their groups.
- **Collapsed groups** are kept per view for the tab's session (`sessionStorage`), so a reload in the tab keeps them.
- **Grouping filters the one sorted sequence,** so each group keeps the view's order, manual order included (FR-05.8).

**DS-44 Initial presentation** *(handoff FR-05.10)*. Saved defaults and remembered choices always win (FR-11.7).

| Context | First-time default |
| --- | --- |
| Lists, Unsorted | Chronological year, ascending; combined (no grouping); Rows |
| Folders, root | Manual order |
| Shared views (viewers, guests) | Same defaults; guests always start from these (FR-11.9) |
| Mode on entry (desktop owner) | Viewing (DS-45) |

- **Folders and root:** with no arrangement yet, manual order falls back to creation order. This makes the sidebar tree the user's own arrangement.
- **Manual order before anyone arranges a list:** for a person who hasn't arranged a list, it falls back to the order in which albums were added to that list, oldest first. A viewer's manual order never starts from the owner's arrangement (FR-05.2).

*As built in TON-35:*
- **Every first-time default** in the table is built, for the owner's views. Shared views wait for M7, and the mode for TON-37.
- **Manual order shows these fallbacks** until rearranging writes positions (TON-36):
  - a list's albums in the order they were added, ties by ID;
  - folders and lists in creation order;
  - Unsorted newest first, as DS-51's inbox. Until TON-36, "newest" means the album's creation, so an album leaving its last list doesn't yet come to the top.

*As built in TON-36:* manual order is the person's arrangement (TS-16): arranged items by their keys, then the rest in these fallback orders. DS-51 keeps Unsorted's top, so an album leaving its last list now comes to the top.

**DS-45 Viewing and editing modes.** These reconcile FR-04 with a Linear-like feel: the mode controls chrome, and edit intent switches modes. *(FR-04.1, FR-04.2)*

- **Viewing** is the default. It shows a clean list or grid: no checkboxes, drag handles, add-rows, or inline-edit affordances. The inspector shows values read-only.
- **Editing** shows checkboxes, drag handles (manual sort only), "+ Add album" at the end of a list, and inline-editable cells (title, artist, year on double-click or Enter). Inspector fields become editors.
- **Toggle:** a segmented control in the view header (`View | Edit`) and the shortcut `E`.
  - The mode is app-wide, persists per device, and is not synced.
  - The active mode is always visible in the header. Editing mode also tints the header's bottom border with `accent.solid`.
- **Edit intent switches the mode.** Pressing an editing shortcut (`C`, `M`, `L`, `⌫`, rename), using an edit command from the palette or context menu, or pasting a link in viewing mode switches to Editing first. A polite live region announces "Editing mode on".
- **Leaving editing mode** with an inline edit open: a valid value is committed (normal save states apply); an invalid value keeps the editor open with its error, and the mode does not switch until the user fixes or discards it.
- **No toggle** appears for viewers of shared content (a "View only · Shared by {name}" pill instead) or on mobile.

*As built in TON-37:*
- **The toggle** is a segmented control labelled "Mode", `View | Edit`, before View options in the header of the root, folders, lists and Unsorted. E switches it, outside text fields.
- **The mode is kept on the device** as `tonaris:mode:<accountId>`, Viewing when unset. Below 768 px, the toggle is hidden and the mode reads as Viewing.
- **Announcements:** switching announces "Editing mode on" or "Editing mode off", politely.
- **Edit intent** switches to Editing first: N, ⇧N and the "+" menu, "New list" in an empty view, F2 in the tree and on an album row, Edit on a failed write, M, and a drop that moves a folder or list onto the tree (decided with the creator on 23 October 2026).
- **Leaving Editing** commits every open inline editor, the tree's name editor included, as leaving its field would:
  - a valid value is saved, and the mode switches;
  - a blank new name is discarded;
  - a refused value keeps its editor open, focused, with its error, and the mode stays.
- **Unchanged in both modes:** keyboard rearranging, View options, and opening folders and lists. Selection checkboxes and "+ Add album" come with selection and capture.
- **Interface state only:** switching sends nothing, and the server judges every write the same (FR-04.2).

**DS-46 Album inspector.** It opens with Enter or a click on a row, shows the album at `?album=:id`, and Esc closes it. With the inspector open, J/K moves to the next or previous album. Sections, top to bottom: *(FR-03.1–FR-03.4, FR-06.2–FR-06.4, FR-01.6, FR-01.8, FR-14.1)*

1. **Artwork** (240px), title and artist credit.
2. **Chronology:** release type (Album / EP / Compilation / Unknown), a Live switch, original release year, and recording year or range (shown when Live is on). Hints explain which year sorts.
3. **Links:** one row per service, each with Open, Replace, and Remove (editing). A pending alternative link from capture (FR-06.4) shows as a notice: "Another Spotify link was found for this album · Replace · Dismiss".
4. **Custom fields:** applied fields with editors (DS-26), then "+ Add field".
5. **Lists:** membership chips with × to remove and "+ Add to list" (`L`). With no memberships, an "Unsorted" chip.
6. **Info:** source service and date added to the collection.
7. **Footer (editing):** "Delete from collection…" in danger text.

*As built in TON-38:*
- **Opening:**
  - a click on an album's row or card, except its drag handle. Opening the inspector narrows the view, so in Editing mode, with the inspector closed, a click waits 300 ms for a double-click, which edits the cell instead;
  - Enter on a row or card in Viewing mode. In Editing mode, Enter on the title, artist or year still edits the cell (DS-45).
  - From a view, opening adds a history entry. With the inspector open, focus moving to another album (J, K, the arrows, a click) shows that one in place.
- **Closing:** Esc, unless a field, dialog, popover or menu has the keys, or the Close button.
- **Viewing mode** shows the values. **Editing mode** makes them editors:
  - **title, artist, original year and recording year or range:** fields that save on Enter or leaving them and discard on Escape, as one `album.update` (TS-21);
  - **release type** (a segmented control) and **Live** (a switch): saved as chosen.
  - **Refusals** stay with their reason and send nothing, as in DS-45. Switching Live off for an album with only a recording year reads "Give the album a year.", and Live stays on.
  - **Leaving Editing mode** saves open fields, or stays for a refused one (DS-45). Offline, the editors are read-only, with "You're offline. Changes can wait until the connection is back."
- **The sort hints:** "Sorts by its original release year.", "Sorts by its recording year." or "Sorts by its release year, as the recording year is unknown."
- **Links and Custom fields** show a line each until their features arrive: "Links to Spotify, Apple Music, Qobuz and Tidal arrive with link capture." and "Custom fields arrive in a later version." Links arrived in TON-46, and custom fields in TON-50 (below).
- **Lists:**
  - **The chips** link to their lists, with the folder path as their tooltip, or to Unsorted.
  - **In Editing mode,** a chip's × removes the album from the list, with "Removed from {list}" and Undo (DS-50). Undo puts the entry back at the end of the list.
  - **"+ Add to list", or L,** opens "Add '{title}' to a list": the owner's lists the album isn't in, with their folder paths, moved through with Tab or ↑ and ↓. Choosing one announces "Added {title} to {list}".
- **Info** shows "Added {date}", from the album's ID. The source service arrives with capture (M3).
- **Artwork** is the letter tile until capture brings artwork URLs (decided with the creator on 23 October 2026). *As built in TON-48:* the album's artwork through the image proxy, named "Cover of {title}". In Editing mode, an "Artwork URL" field under it ("https://…") saves on Enter or when left; empty clears it, and one that isn't an https link stays with "Give the artwork as an https link, such as https://example.com/cover.jpg."
- **Delete from collection…** arrives with Trash (M5).

*As built in TON-46:* **Links** (FR-06.2, FR-06.3).
- **Viewing mode:** a row per service the album has a link for: its name, and the URL's host and path as a link that opens the page in a new tab. Each row is itself an explicit choice of service (DS-25), so it stays a plain link after TON-47. With none: "No links yet."
- **Editing mode:** a row for every service.
  - **A linked service:** **Replace** and **Remove**.
  - **Replace** turns the row into a field labelled "Spotify link", with the URL selected and the placeholder "Album or track link". Enter or leaving it saves; Escape discards. Empty or unchanged, it closes without sending anything.
  - **A refused link** stays in the field with its reason, as capture gives it (DS-48), or "This is an Apple Music link. Paste a Spotify link here."
  - **Remove** applies at once, with "Removed the Spotify link" and Undo (DS-50).
  - **A service without a link:** "Add Spotify link", which opens the same field, empty.
- **Each row** shows its save state (DS-80). The stream replaces the link as typed with its canonical URL.
- **Offline,** the rows are read-only, as the album's fields are (DS-81).
- **Capture's kept link** ("Another Spotify link was found for this album · Replace · Dismiss") comes with the capture interface (TON-45).

*As built in TON-50:* **Custom fields.**
- **Applied fields** are rows, by name, each with its value. With none in Viewing mode: "No custom fields."
- **Editing mode:**
  - each row has its editor (DS-26), and × "Remove {field}", which clears the value, with "Removed {field}" and Undo;
  - "+ Add field" lists the unused fields, then "Create field…".
- **"New field"** (shared with DS-60):
  - Name; Type (Text, Number, Date, Yes/no, Single choice, Multiple choice); for choice types, Options, with "Add option" and × per option, empty rows left out;
  - **Create field**, or ⌘Enter;
  - the inspector applies the new field once it is defined;
  - the reasons are the server's, such as "'Rating' already exists. Choose another name."

*As built in TON-45:* **the kept link's notice** heads the Links section while the album still has the kept link: "Another Spotify link was found for this album", the pasted link, and **Replace** and **Dismiss**. Replace sets the pasted link, switching to Editing first. The notice lives in the tab that captured, until replaced, dismissed or reloaded.

**DS-47 Manual entry form.** A 560px dialog titled "New album" (desktop). Shortcut ⌘Enter saves; Esc asks before discarding entered data. *(FR-02.4, FR-02.6, FR-13.2)*

- **Field order:**
  1. Title*
  2. Artist credit*
  3. Release type + Live
  4. Original release year
  5. Recording year or range (when Live)
  6. Artwork URL (with live preview)
  7. Spotify / Apple Music / Qobuz / Tidal links
  8. Custom fields (+ Add field)
  9. Destination list
- **Year rule** in the helper text: "Required: original release year — or, for live releases, the recording year or release year."
- **Validation** runs on blur and on submit. Errors appear inline under each field and are summarized at the top for screen readers.
- **Destination list** is an optional combobox. It defaults to the current list when opened from one; otherwise it reads "No list (goes to Unsorted)".
- **Opened from a failed capture:** the form is pre-filled, and a banner explains why: "We couldn't read this link — complete the details below."

*As built in TON-38:*
- **Its description:** "Title, artist and a year are required. Everything else can wait."
- **Artwork URL, links and custom fields** are shown in order with a line each until their features arrive: "Artwork arrives with link capture." (decided with the creator on 23 October 2026), and the same lines as the inspector's.

*As built in TON-45:* **from a capture,** a note under the description gives the reason it came to the form, or "We couldn't read this link — complete the details below." when there is none.
- **Asked for details,** or "None of these": prefilled with capture's values, such as Apple's title, artist and year. The link fields give way to "The link is kept: {link}". Saving completes the capture, which keeps the link and the sources of the values left as offered (TS-15), and announces "Adding {title}".
- **After a failure:** the pasted link is in its service's field. Saving adds the album as usual and dismisses the failed capture.
- **"Add album" opens the capture dialog;** manual entry is its "Enter manually".

*As built in TON-50:* **"Custom fields"** replaces its line, with the inspector's editors and × per field, and an "Add field…" select of the unused fields and "Create field…". A select rather than a menu stays inside the dialog. Saving applies the fields after the album. A form completing a capture has none.

*As built in TON-48:* **"Artwork URL"** replaces its line, with the placeholder "https://…". It is optional, checked when left and on submit, with the inspector's reason.

*As built in TON-46:* **links** replace their line: "Spotify link", "Apple Music link", "Qobuz link" and "Tidal link", each optional, with the placeholder "Album or track link".
- **Checked when left and on submit,** like the other fields, with the inspector's reasons, and named in the summary.
- **Saving** adds the album, then its links, then its entry in the list. The server stores each link's canonical URL.
- **Validation:**
  - **The messages:** "Give the album a title.", "Give the album an artist.", "Give the album its original release year.", for a live album "Give the album its recording year or its release year.", "Enter the year as four digits, such as 1986." and "The recording period ends before it starts."
  - **On submit,** an alert at the top reads "Check {n} fields: {names}.", and the first field with a problem takes the focus.
- **The destination** is a native select of "No list (goes to Unsorted)" and the owner's lists with their folder paths. A combobox can replace it when there are more lists than a select suits.
- **Saving** adds the album, then its entry in the list, closes the form, and announces "Added {title}".
- **Esc, Cancel or closing** with anything entered asks "Discard this album?" ("What you entered isn't saved."), with Keep editing and Discard.
- **It opens from:**
  - the sidebar's + Add album;
  - "Add album" below a list's rows in Editing mode, and as an empty list's action;
  - Edit on a failed album save, as it was entered, with its list. Saving it dismisses the failure.

  Each switches to Editing first.

**DS-48 Link capture.** *(FR-02.1–FR-02.3, FR-02.5, FR-02.9–FR-02.11, FR-01.7, FR-06.4, FR-14.4, FR-15.3, X-04)*

- **Paste anywhere:** ⌘V with no text field focused, in a list, Unsorted, root, or folder view (desktop owner only).
  - In a list, links go to that list.
  - Elsewhere they are saved without a list. A toast offers "Add to list…" (`L`).
- **`C` or "+ Add album"** opens a capture popover. It has a multi-line input (one link per line), a destination combobox, and an "Enter manually" link that opens DS-47.
- **Inline progress:** each link becomes a placeholder row at its insertion point, showing skeleton artwork and "Resolving link…". The row becomes the real album on success.
  - **Failure:** the row turns into an inline error row with the reason and three actions: **Retry**, **Enter manually** (pre-filled), and **Dismiss**. The pasted link is preserved until dismissed.
  - **Reasons for links that can't be read** (TS-40), *as built in TON-39*:

    | Case | Reason |
    | --- | --- |
    | Not a link of the four services | "This doesn't look like a Spotify, Apple Music, Qobuz or Tidal album or track link." |
    | A service's link that isn't an album or track | "Only Spotify album and track links can be added." (with the service's name) |
    | An album or track link whose id looks cut off | "This Spotify link looks incomplete. Copy it again from Spotify." |
    | A short link that leads nowhere | "This Spotify short link doesn't lead to an album or track." |
    | A short link Spotify didn't answer | "Couldn't reach Spotify to open this short link. Try again." |

  - **Reasons for links that go to manual entry** (TS-41), *as built in TON-42*. The form opens with the link kept, and for Apple with iTunes Lookup's title, artist and year:

    | Case | Reason |
    | --- | --- |
    | No step identified the album | "Tonaris couldn't find this album in MusicBrainz. Enter its details; the link is kept." |
    | A Qobuz or Tidal track link | "A Tidal track link doesn't say which album it's on. Enter the album's details; the link is kept." (with the service's name) |
    | A Spotify track with the bridge off | "Tonaris can't ask Spotify which album this track is on right now. Enter the album's details; the link is kept." |
    | The service no longer has it | "Spotify doesn't have this anymore. Check the link, or enter the album's details." (with the service's name) |
    | A source that can't be reached (`provider_unavailable`) | "Couldn't reach MusicBrainz. Try again, or enter the details manually." (with the source's name) |
    | MusicBrainz has the album but no year (FR-02.6), *as built in TON-44*; the form is prefilled with MusicBrainz's values | "MusicBrainz doesn't know when this album first came out. Enter its year; the link is kept." |
- **Outcome toasts**, replacing the row where relevant:

  | Outcome | Toast | `album.capture`'s result (TON-44) |
  | --- | --- | --- |
  | Confident match, added to this list | "Already in your collection — added to this list" | `match: "reused"`, `alreadyInList: false` |
  | Already in this list | "Already in this list" (the row flashes) | `alreadyInList: true` |
  | Restored from Trash (FR-14.4) | "Restored from Trash and added" | `match: "restored"` |
  | Different link already saved for that service (FR-06.4) | "Kept your existing Spotify link · Review" | `keptLink` |

- **Uncertain match:** an inline decision card in the row asks "Is this the same album?"
  - It shows the existing album (artwork, title, year, services) and plain-language evidence: matching identifiers, title, artist and year.
  - Actions: **Same album — link it**, **Different album — save separately**, **Decide later**. "Decide later" keeps the item pending in the batch report.
- **Batches** (more than one link) show a progress panel in the bottom-right, e.g. "Adding 12 · 8 done · 2 need you · 1 failed", which expands into the BatchOutcomeReport (DS-84).
- **Capacity refusals** appear inline with a link to the usage meter (DS-98).

*As built in TON-45:*
- **Pasting:** ⌘V on desktop captures every pasted line that looks like a link: an `http(s)` URL, a `spotify:` URI, or a service's host without the scheme. Other lines are dropped, and a paste with none does nothing.
  - It acts unless a text field has focus or a dialog, popover or menu is open (DS-78), and waits while offline.
  - It switches to Editing first (DS-45).
  - At most 200 links at once: "Add up to 200 links at once."
- **The capture dialog,** "Add albums", opens from `C` and every "Add album": the sidebar's, the empty list's and the one below a list's rows.
  - It has "Paste Spotify, Apple Music, Qobuz or Tidal album or track links.", a Links textarea ("One link per line"), and the List select from manual entry, defaulting to the list on view.
  - **Add** or ⌘Enter captures every non-empty line; a line that isn't a link gets its reason in its row. With none: "Paste at least one Spotify, Apple Music, Qobuz or Tidal link."
  - "Enter manually" opens DS-47 for the chosen list.
- **Placeholder rows** sit at the top of the destination view, the list or Unsorted, in "Albums being added", whatever the sort, since the album's place is known only once it is identified. The section scrolls past 40% of the view.
  - Each row has a skeleton tile and the link's host and path.
  - Pending: "Resolving link…", with `aria-busy`; unanswered: "Waiting for an answer…".
  - Failed: the reason in danger text, with Retry, Enter manually and Dismiss.
  - Needing details: the reason, with Enter manually and Dismiss.
  - Fitting several albums: the decision card, and Dismiss.
  - Saved: the row goes and the album is in its place. A new one is announced, "Added {title}".
  - The rows are this browser's captures, kept across reloads.
- **The decision card** (as TS-44 shapes it; TON-44's note). DS-48's "Is this the same album?" compared a saved album with a new one. Since G2, an uncertain match is a choice between MusicBrainz albums.
  - It asks "Which album is this?", with a button per candidate's title. A candidate already saved reads "In your collection · {artist}, {year}".
  - **"None of these"** opens manual entry, which saves the album unidentified with the link.
  - **"Decide later"** folds it to "Fits more than one album." with **Decide**. In Activity and the report it starts folded.
- **Outcome toasts,** for a capture made on its own:
  - a new album whose row was on screen raises none;
  - elsewhere: "Added '{title}' to '{list}'", or "Added '{title}' to Unsorted" with **Add to list…**;
  - "Already in your collection — added to this list", or "Already in your collection" without a list, with Add to list…;
  - "Already in this list", and the album's row flashes;
  - "Restored from Trash and added", or "Restored from Trash";
  - "Kept your existing Spotify link", with **Review**, which opens the inspector at the album.
  - **Failed:** "Couldn't add an album from this link", the reason, Retry and Enter manually, persistent.
  - **Waiting for the person:** "Choose which album this link is", with Decide, which opens the destination view; or "Add this album's details", with Enter manually.
  - A batch's captures raise none; its panel and report carry them.
- **The capture panel,** bottom right, shows while a batch of captures is underway: "Adding 4 · 1 done · 1 need you · 1 failed". It opens Activity at the batch's report, and goes once nothing is underway.
  - The batch's toast counts albums: "Couldn't add 2 of 4 albums". A batch that wholly saves is announced as "4 albums added."
- **Reasons** for a capture waiting for the person: details give capture's reason; a choice reads "This link fits more than one album. Choose which it is."
- **Capacity:** a refusal shows its reason in the row. The link to the usage meter comes with DS-98 (TON-60).
- **Activity and reports** name a capture by its link until saved: "Add an album from open.spotify.com/album/…".

**DS-49 View options and rearranging.**
- **View button** in the header, or `V`, opens a popover:
  - Sort: lists offer Year / Name / Manual; folders offer Name / Created / Manual.
  - Direction toggle, disabled for Manual.
  - Grouping: None / Release type (lists and Unsorted only).
  - Layout: Rows / Grid.
  - Footer: "Use account defaults" and "Save as my default". Defaults live in Settings → Preferences.
- **Rearranging** happens only with Manual sort, on desktop (FR-05.2, section 2.2).
  - **Pointer:** drag handles in editing mode.
  - **Keyboard:** ⌥↑ / ⌥↓ moves the selected item by one; ⌥⇧↑ / ⌥⇧↓ moves it to the top or bottom; "Move to position…" in the palette takes a number.
  - Each move announces "Moved {name} to position {n} of {total}".
  - Trying to rearrange under another sort shows a hint with the action "Switch to manual order".
- **Moving items between containers** is a collection edit (editing mode).
  - **Pointer:** drag onto a sidebar tree item.
  - **Keyboard:** `M`, "Move to…", opens a folder/root picker.
  - **Adding albums to lists:** `L`, "Add to list…". In a list, albums can also be dragged onto another list in the sidebar, which adds a membership and doesn't remove the current one; holding ⌥ moves them instead (remove here, add there).
  - **Sharing preview:** the picker footer and drag-hover tooltip show the destination's SharingImpact (DS-69) before anything applies.
  - **When effective sharing would change**, a confirmation popover lists the change ("Will become visible to 2 people and anyone with the 'Metal' link"), with Move and Cancel. When nothing changes, the move applies immediately.
  - *(FR-01.4, FR-01.5, FR-07.9, FR-07.14)*

*As built in TON-35:*
- **The View button** sits at the end of the header in the root, folders, lists and Unsorted, with `aria-keyshortcuts="V"`. Its popover is titled "View options" for assistive technology.
- **Each choice is a segmented control,** a radio group with the arrow keys between options. Folders and the root have Sort and Direction only.
- **Each choice is remembered for the view** at once and saved to the account (FR-11.7, FR-11.8): the sort with its direction, the grouping, and the layout, each on its own. A choice not made follows the account defaults.
  - Choosing works offline: it waits in the outbox, as it isn't a collection edit (X-04).
  - A conflicting choice from another session is reviewed like any conflict (FR-09.4), with its fields named Sort, Direction, Grouping and Layout, and an unset value as "Account default".
- **"Use account defaults"** clears the view's choices, and is disabled when it has none.
- **"Save as my default"** makes the view's choices the defaults for its kind: sort, direction, grouping and layout for lists and Unsorted, sort and direction for folders and the root. It is disabled when they already are.
- **Rearranging** comes with TON-36. Until then, Manual shows DS-44's fallbacks.

*As built in TON-36:*
- **Rearranging,** under Manual sort only:
  - **Keyboard:** ⌥↑ and ⌥↓ move the focused item by one, and ⌥⇧↑ and ⌥⇧↓ to the top or bottom, in rows and cards. Focus follows the item.
  - **Pointer:** a row's drag handle, in Editing mode (TON-37). A 2 px `accent.solid` line shows where it would land, and an overlay with its name follows the pointer.
  - **Grouped,** an item moves among its own group's items, in the one arrangement (FR-05.8).
  - **Each move is announced** politely: "Moved {name} to position {n} of {total}", counted within the group when grouped.
  - **Under another sort,** ⌥↑ or ⌥↓ moves nothing. An info toast says "Rearranging works in manual order", with "Switch to manual order".
  - **It works offline,** being presentation (X-04).
  - **"Move to position…"** waits for the command palette (TON-63).
- **Moving folders and lists:**
  - **`M`, "Move to…",** acts on the focused tree item, else the focused folder or list row of a view, else the folder or list the view shows. The dialog lists Collection and the folders that can take it, indented by level, and ↑ and ↓ move between them.
  - **Dragging** a folder or list from its row or the tree onto a folder in the tree, or onto Collection, moves it.
  - **After a move,** the destination opens in the tree, and "Moved {name} to {destination}" is announced. The item follows its new parent's arranged items, in creation order among the rest.
  - **While offline,** M does nothing and the tree takes no drops (DS-81). A refused move is reported like any failed write (DS-107).
  - **Not yet:** adding albums to lists, with L or by dragging onto a list (their issue), and SharingImpact previews (DS-69, M7).

**DS-50 Removal and deletion feedback.** *(FR-01.11, FR-01.8, FR-14.1, X-07)*

| Action | Feedback |
| --- | --- |
| Remove album from list (`⌫`) | Immediate, with undo toast "Removed from {list} · Undo" (8s) |
| Delete list (single or multi-select) | Immediate move to Trash, with undo toast "{n} lists moved to Trash · Undo". Undo runs Trash recovery. |
| Delete folder | Standard confirmation dialog: hierarchy counts and the first names, "albums stay in other lists or Unsorted", sharing effects |
| Delete album from collection (`⌘⌫`) | Standard confirmation dialog: "Removes it from every list and Unsorted; recoverable from Trash for 30 days" |

*As built in TON-55:*
- **Triggers:**
  - ⌫ (Backspace or Delete) deletes the focused folder or list, in the sidebar or a folder's rows, switching to Editing mode;
  - Editing mode adds **Delete list** or **Delete folder** to a folder's or list's header.
- **A list** goes at once, with "1 list moved to Trash" and Undo, which recovers it. A page showing what went goes to the nearest folder that stays, or the collection.
- **A folder** asks first:
  - the title "Delete folder 'Metal'?";
  - the scope "The folder and 2 lists inside it: Doom, Sludge" (first three names, then "…"), or "The folder, which is empty";
  - "Albums stay in their other lists or in Unsorted." and "Recoverable from Trash for 30 days.";
  - the action "Move 1 folder and 2 lists to Trash";
  - Cancel focused.
- **The live region** says "Moved Metal to Trash" and, on Undo, "Recovered Doom".
- **Multi-select** comes with selection (X).

*As built in TON-57:* **deleting an album.**
- **Triggers:** ⌘⌫ (Ctrl+⌫ elsewhere) on the inspector's album, else the focused album; and **Delete from collection…** at the foot of the inspector in Editing mode.
- **The confirmation:**
  - title "Delete 'Bleach' from your collection?";
  - scope "It leaves 2 lists: Doom, Later." or "It leaves Unsorted.";
  - consequences "Removes it from every list and Unsorted." and "Recoverable from Trash for 30 days.";
  - action "Move to Trash".
- **After confirming:** "'Bleach' moved to Trash", and the inspector closes.

**DS-51 Unsorted placement** *(handoff FR-05.4)*:
- An album entering Unsorted, whether new or leaving its last list, is placed at the **top** of the owner's Unsorted manual order. Unsorted behaves like an inbox.
- Positions are not retained when an album leaves and later returns.
- New albums added to a **list** go at the **end** of the adding owner's manual order, which suits lists used as rankings.
- Viewers' arrangements place newly added albums at the end.

*As built in TON-36:* the server keeps these places in the commands that change memberships and parents (TS-16).
- **An album leaving its last list** gets a key at the top of the owner's Unsorted. A new album does too, once Unsorted has keys; before that, Unsorted's fallback order, newest first, already puts it on top.
- **An album joining a list** loses its Unsorted key, and one removed from a list loses its key there. So each returns as new.
- **New albums in a list** have no key, so they follow the arranged ones: the end.
- **A moved folder or list** loses its key in its old parent.
- **Viewers' arrangements** come with sharing (M7).

---

## 6. Trash

**DS-55 Trash view** (desktop only). A table of **units**, each row showing:
- type icon and name;
- what the unit contains (e.g. "Folder · 6 lists, 2 folders" or "Album");
- deletion date;
- expiry: relative ("Expires in 12 days"), with the exact date on hover or focus; under 3 days the text turns `status.warning`;
- former location.

Folder units expand to show their contents read-only. Contents are labelled "Part of '{folder}' — restore or delete the folder to act on these" and have no actions of their own. A local name filter narrows the table; this is not global search. Actions per unit: **Restore** (`R`) and **Delete permanently…**. The header has **Empty Trash…**. *(FR-01.12, FR-01.13, FR-01.17, FR-12.1)*

*As built in TON-59:*
- **The table:** "Trash", newest deletion first, with the columns Name (an album with its artist), Contents, Deleted (medium date), Expires and Was in.
  - **Contents:** "Folder · 2 lists, 1 folder", "List" or "Album".
  - **Expires:** "Expires in 12 days" or "Expires within a day", in `status.warning` under 3 days. Its focusable tooltip shows the date and time.
  - **Was in:** "Collection", "'Metal'", "'Metal' (in Trash)", "A deleted folder", or "—" for albums.
- **The header:** "Filter by name" and **Empty Trash…** (disabled when empty).
- **Empty states:** "Nothing in Trash. Deleted items stay here for 30 days.", and "Nothing in Trash matches 'x'." for the filter.
- **A folder's name** is a disclosure button. Its contents, nested and read-only, are under "Part of 'Metal' — restore or delete the folder to act on these."
- **Row actions:** **Restore** (R anywhere in the row) and **Delete permanently…**.
- **On a narrow screen:** "Trash is on the desktop app."

**DS-56 Recovery prompts.** All prompts preview the effective sharing through SharingImpact (FR-07.14). *(FR-01.14–FR-01.16, FR-14.2, FR-14.3, FR-07.10)*

- **Destination** (original parent unavailable): a dialog explains "'{parent}' is in Trash or no longer exists. Choose where to restore '{item}'." It offers a tree picker of active folders and the root, then **Restore** or **Cancel**.
- **Name collision:** a dialog explains "'{destination}' already has a list or folder named '{name}'." It offers a name input pre-filled with the current name, selected for editing; Tonaris never auto-renames. A "Choose another location…" link opens the picker. Then **Restore** or **Cancel**.
- **Skipped memberships** (container or album restore): a toast reads "Restored · 2 memberships skipped". A **Details** button opens a report listing each skipped album or list with its reason.
- **Same-album conflict** (album restore): a dialog shows both records side by side with the explanation from FR-14.3, and three actions:
  - **Keep the active album** (cancels the restore);
  - **Delete the active album, then restore…**, which leads to the standard confirmation dialog;
  - **Cancel**.

*As built in TON-56:*
- **Album restore** (TON-57) asks nothing about place or name. A same-album pause shows "Restore 'Bleach'?":
  - "'Bleach' is already in your collection as the same album. Restoring would make two records of it, so nothing has changed: both stay as they are.";
  - both records, the one in Trash and the active one;
  - **Keep the active album** (focused), **Delete the active album, then restore…** (which confirms the deletion first: "Move to Trash and restore"), and **Cancel**.
- **One flow for every surface:** Undo now, the Trash view later. The client asks before sending, from the collection it holds; the server checks again.
- **Destination:**
  - title "Restore 'Doom'";
  - "'Metal' is in Trash or no longer exists. Choose where to restore 'Doom'." ("Its folder" when the parent's name is unknown);
  - "Collection" and the active folders, nested, as a radio group;
  - **Restore** or **Cancel**.
- **Name:**
  - the same title, and "'Collection' already has a list or folder named 'Doom'.";
  - a "Name" field with the name selected, and "Choose another location…";
  - **Restore** (or Enter) or **Cancel**. A taken or invalid name is refused with its reason.
- **After:** "Restored 'Doom'", or "Restored · 2 memberships skipped" with **Details**.
  - **The report:** "Skipped while restoring 'Doom'", "These albums weren't put back in their lists. Everything else was restored.", and each "{title} · {artist}" with "The album is in Trash" or "The album was deleted permanently", plus "· was in '{list}'";
  - **Done**.

**DS-57 Permanent removal.** Both use the standard confirmation dialog (DS-28) with "This can't be undone", and the button names the count, e.g. "Permanently delete 34 items". *(FR-01.18, FR-14.5)*
- **Delete permanently:** for an album unit, the dialog shows the slot that will be freed.
- **Empty Trash:** totals by type.

*As built in TON-59:*
- **Delete permanently:**
  - title "Permanently delete 'Bleach'?";
  - scope "The album 'Bleach' · Nirvana, with its links and field values" and "Frees 1 album slot.", or "The list 'Doom'" / "The folder 'Metal' and the 2 lists inside it" with "Its albums stay in their other lists or in Unsorted.";
  - "This can't be undone.";
  - action "Permanently delete 3 items".
- **Empty Trash:**
  - title "Empty Trash?";
  - totals ("2 albums", "1 list");
  - "Albums still in your collection stay; purged albums free their slots." and "This can't be undone.".
- **After:** "Deleted 'Bleach' permanently" or "Trash emptied", with "· 1 item was already gone" when a unit had left Trash meanwhile.

---

## 7. Custom fields

**DS-60 Settings → Custom fields.** A table of definitions with columns for name, type, options (count; expandable), and usage ("Used by 214 albums · 3 in Trash"). *(FR-03.6–FR-03.18, X-09)*

- **Create:** a dialog for name, type, and, for choice types, an options list editor.
- **Rename:** inline; uniqueness errors appear inline (X-06).
- **Type change** is a select in the row's edit panel.
  - **Used field:** the select is disabled, with "Used by 214 albums (3 in Trash). Create a new field of the type you need instead." and a **Create new field** button. *(FR-03.12)*
  - **Choice to non-choice:** an inline warning lists the options that will be discarded before saving. *(FR-03.13)*
- **Options** can be added, renamed inline, and removed with ×.
  - Removing an **unused** option is immediate, with no dialog.
  - Removing a **used** option opens the standard confirmation dialog with the field, the option, affected album counts (active and Trash), and "Changes are visible in {n} shared lists" when relevant. *(FR-03.17)*
- **Delete field** always opens the standard confirmation dialog, even when unused. It lists the definition, options, and values across active and Trash albums, shared-view effects, and "This can't be undone — Trash and album restore won't bring it back". *(FR-03.18)*
- **Applying fields to albums** happens in the inspector (DS-46). The "+ Add field" menu also has "Create field…", which opens the create dialog and then applies the new field.

*As built in TON-53:*
- **The table:** columns Name, Type, Options ("3 options", or "—" for other types) and Usage ("Used by 214 albums · 3 in Trash", "Used by 1 album", "Unused", or "—" before the counts arrive).
  - Usage comes from `GET /v1/fields/usage`, read again whenever the fields or values change.
  - **New field** sits above the table. At 50 fields it is disabled, with "You've reached 50 custom fields. Delete one to add another."
  - With no fields: "No custom fields yet. Create one for anything you track, such as a rating or where you bought an album."
- **Each row's name is a disclosure button** opening its edit panel below it.
- **The panel's Name** saves on Enter or when left; Escape reverts. A refused name stays with its reason, such as "'Mood' already exists. Choose another name."
- **Type:**
  - **locked:** the select is disabled, with "Used by 1 album. Create a new field of the type you need instead." (or "Used by 3 albums (1 in Trash). …") and **Create new field**;
  - **discarding:** "Changing to Text discards its options: Calm, Loud." with **Change type** and **Keep options**;
  - any other change saves at once.
- **Options:**
  - each label is an input, "Option 'Calm'", saved like the name;
  - × "Remove Calm";
  - a "New option" input with **Add option** (or Enter), refusing a label in use: "'Calm' already exists. Choose another label.";
  - "No options yet." when empty.
- **Removing a used option:** title "Remove option 'Calm'?"; scope "Chosen on 12 albums in 'Mood'" and "3 of them in Trash"; consequences "Those albums keep the field, empty." (single choice) or "Those albums keep their other options.", then "This can't be undone."; action "Remove from 12 albums".
- **Delete field:** title "Delete field 'Mood'?"; scope "The field and its 3 options: Calm, Loud, Odd" (or "The field"), and "Values on 214 albums, 3 of them in Trash" (or "No album uses it"); consequence "This can't be undone — Trash and album restore won't bring it back."; action "Delete field".
- **If a read fails:** "Couldn't check where 'Calm' is chosen. Try again." or "Couldn't check what deleting 'Mood' affects. Try again."

---

## 8. Sharing

**DS-65 Sharing dialog.** Notion-like, opened from the header **Share** button or `⇧S`. Owner only, desktop. *(FR-07.1–FR-07.16, FR-11.3)*

```
┌ Share "Death Metal" · folder ───────────────────────────────┐
│ Viewers see every custom field these albums use (including  │
│ ones you add later). Sharing a folder includes everything   │
│ inside it, now and in the future.                           │
│                                                             │
│ [ Invite by email…                    ] [Invite]            │
│  Anna K.       anna@…      Accepted                   ⋯     │
│  bob@…                     Pending · email failed  Resend ⋯ │
│ Also visible through "Metal": 2 people · link               │
│ ─────────────────────────────────────────────────────────── │
│ Link sharing                                         [ on ] │
│  Anyone with the link can view and forward it.              │
│  [ https://tonaris…/s/… ]                           [Copy]  │
└─────────────────────────────────────────────────────────────┘
```

- **Disclosures** (FR-07.14) are always visible at the top, compact and non-dismissable, so they are seen before Invite or Enable. The link disclosure sits next to the switch.
- **Missing display name:** the Invite button and link switch are replaced by an inline "Add a display name to share" field (FR-11.3). Viewers see this name instead of your email.
- **Per-person status:** Pending / Accepted, plus the email delivery state: sending… / sent / failed with **Resend**. *(FR-07.5)*
- **Row menu:** "Remove access", which revokes. Inherited access is listed read-only, with a link to the ancestor's dialog.
- **Disabling the link** needs an inline confirmation: "Turn off link? This link stops working permanently; turning it back on creates a new one."
- **Errors:** an unregistered recipient gets an inline error that keeps the typed email: "No Tonaris account uses this email. Invitations only work for existing members — you can share a link instead." *(FR-07.4)*

*As built in TON-65:*
- **Opening it:** a **Share** button in a folder's or list's header (hidden below 768px, disabled offline), **⇧S** for the focused or viewed folder or list, and the palette's "Share…".
- **Title:** "Share "{name}" · folder" or "· list".
- **Disclosures:** the description reads "Viewers see every custom field these albums use, including ones you add later.", plus, for a folder, "Sharing a folder includes everything inside it, now and in the future."
- **Without a display name:** a field labelled "Add a display name to share", with "Viewers see this name instead of your email." and **Save**, takes the place of Invite and the link section.
- **Inviting:**
  - The field reads "Invite by email…", with **Invite**.
  - A refusal shows under it in `status.danger`, as an alert, and keeps the address. Inviting yourself says "You can't invite yourself."
  - **"People with access"** lists each invitation: the person's display name if they set one, the address as typed, and Pending or Accepted. Email delivery states and Resend come with TON-66; "Remove access" with TON-67.
- **Inherited access:** "Access from folders above" lists each shared ancestor, nearest first: "Also visible through "{name}": 2 people · link". The name is a button that opens that folder's dialog.
- **The link section:** "Link sharing", with "Anyone with the link can view and forward it." beside the switch.
  - **On:** the link shows read-only, and **Copy** turns into "Copied".
  - **Turning off** shows the confirmation inline, with **Turn off** and **Cancel**.
  - **The link is the same each time the dialog opens** (TS-32).
- **Offline:** "You're offline. Sharing waits until you're back.", and the controls are disabled.
- *TON-67 adds the row menu:* a "More for {name or address}" button opens a menu with **Remove access**, which revokes the invitation, pending or accepted, and reads the dialog again.
- *TON-66 adds delivery:* a pending row reads "Pending · sending…", "· sent", "· email failed" or "· email not confirmed", with **Resend** for the last two. While anything is sending, the dialog reads again every 1.5 s until it settles.

**DS-66 Invitations inbox.** `/invitations` lists pending invitations: the owner's display name, collection name and type, and date, each with **Accept** and **Decline**.
- **From email:** the email link lands on `/invitations/:id`, which requires sign-in as the recipient.
- **Wrong account:** "This invitation is for a different account — sign out and sign in with that email".
- **Invalid invitation:** "This invitation is no longer available".

*(FR-07.5, FR-07.6)*

*As built in TON-66:*
- **The inbox:** each pending invitation is a row: the collection's name in quotes, then "A list from Denis · 29 Oct 2026", with **Accept** and **Decline**, named for the collection.
  - Accepting says "Accepted "{name}". It's in Shared with me."
  - With none it says "No invitations are waiting for you."
- **The email's page** shows the same row. Then:
  - after accepting, or opened again later: "You accepted this invitation. It's in Shared with me.";
  - after declining: "Declined. Nothing was shared with you.";
  - for someone else's, the wrong-account sentence, and nothing about the invitation;
  - for anything not available (declined, revoked, left, gone or in Trash): the unavailable sentence.
- **Answering** is online-only: offline, the buttons are disabled.
- **The email** reads: subject "Denis invited you to view "Doom" on Tonaris"; text "Denis invited you to view the list "Doom" on Tonaris. Open the invitation to accept or decline it:", the link, then "You'll be asked to sign in with this address. The link works only for you: forwarding it gives no one access."

**DS-67 Shared with me.** The sidebar section and `/shared` index group references by owner display name.
- **Context menu:** **Leave share…** for invitation-based references, with a small confirmation explaining that the owner must re-invite you; **Remove from Shared with me** for link references.
- **Inaccessible references:** shown dimmed with "No longer available" and **Remove**.

*(FR-07.7, FR-07.13)*

*As built in TON-68:*
- **`/shared`:** a section per owner, headed by their display name.
  - **Each reference:** a people glyph for an invitation, a link glyph for a link, its name in quotes, and "Folder · by invitation" or "List · from a link".
  - **Unavailable:** the name is withheld ("A shared folder or list"), the row is dimmed, and it reads "No longer available" with **Remove**.
- **Leave share…** opens an inline confirmation: "Leave "{name}"? {owner} would have to invite you again.", with **Leave** and **Cancel**.
- **Remove from Shared with me** shows for link-only references.
- **When it's empty:** "Nothing is shared with you yet. Invitations you accept and links you add show here."
- **Later:** the sidebar's per-owner entries, and opening a reference, come with TON-69.

**DS-68 Signed-in visit to a shared link.** A banner reads "Shared by {name} · **Add to Shared with me**". It changes to "In Shared with me" after adding. Adding never happens implicitly. *(FR-07.13)*
- *As built in TON-68:*
  - The banner is a strip above the guest page's header, asked for in the browser after the server rendered the page. Guests and the owner don't see it.
  - "In Shared with me" links to `/shared`.

**DS-69 SharingImpact.** A compact block, used in move pickers, move confirmations, recovery dialogs, and the standard confirmation dialog. Each line names people by display name or email as the owner entered it, and link audiences by their source. *(FR-07.9, FR-07.10, FR-07.14)*

| Line | Shown when |
| --- | --- |
| **Newly visible to** … | the operation adds an audience |
| **No longer visible through** … | an audience is removed |
| **Still shared directly with** … | direct shares are preserved |
| "Sharing unchanged" | nothing changes |

The block never says "private" while another access path remains.

*As built in TON-71:*
- **The block** is a bordered panel of short lines, announced politely:
  - "Newly visible to Anna, Ben (invited) and anyone with the link to 'Metal'";
  - "No longer visible through 'Metal': Anna and anyone with its link", one line per folder left;
  - "Sharing unchanged" when nothing is gained or lost;
  - "Still shared directly with …" for shares on the item and its contents.
- **People** go by display name, else the address as typed; "(invited)" until they accept.
- **While reading:** "Checking sharing…". **When it can't be read:** "Sharing effects couldn't be checked."
- **Where it shows:**
  - **Move to…:** under the destinations, for the one last focused or pointed at;
  - **dragging** a folder or list over a folder it can move into: under its name in the drag overlay, after 150 ms;
  - **recovery:**
    - a restore that would make content visible to anyone asks "Restore '{name}'?", "Once it's back, others can see it.", with the block and Cancel or Restore. An unshared one restores at once, and Undo never asks;
    - the destination prompt shows the block for the chosen place.
- **Rules** (`packages/domain/src/sharing-impact.ts`), previewed by `GET /v1/sharing/impact`:
  - a move adds the destination's audiences and removes those of the folders it leaves, less those on the item itself;
  - recovery adds the destination's, and its own shares resume;
  - an album's adds those of its active lists.

**DS-70 Viewer chrome (signed-in).** Same shell. The header shows a "View only · Shared by {name}" pill, has no mode toggle or edit affordances, and offers view options. Desktop viewers can rearrange (DS-49) in their own arrangement. *(FR-05.2, FR-07.17)*
- *As built in TON-69:*
  - **Where:** `/shared/{id}`, opened from Shared with me, with `?c=` for a folder or list inside the share. The header's breadcrumb is "Shared with me"; breadcrumbs inside the share sit above the content.
  - **The content** draws as on guest pages (DS-72): a folder's folders and lists, a list's albums as rows or a grid with Open choosers.
  - **View options** are the workspace's, saved for the viewer and synced. Account defaults apply until they choose.
  - **Rearranging:**
    - In manual order each album row starts with a **Move** button (desktop), which ⌥↑ and ⌥↓ move, ⇧ for the ends. The focus stays with it.
    - A folder's rows move from their links.
    - Outside manual order, the owner's "Rearranging works in manual order" offer applies.
  - **Live:** the page reads again after each of the owner's saves.
  - **When access ends:** the page reads "Not available" and "No longer available. Its owner stopped sharing it with you, or moved it to Trash.", with a link to Shared with me.
  - **Shared with me's** available entries link here.

---

## 9. Guest shared pages

**DS-72 Guest page** (`/s/:linkToken`, server-rendered). *(FR-07.1, FR-07.3, FR-07.11, FR-11.9, FR-12.1, FR-06.5)*

- **Minimal header:** small Tonaris wordmark, container name (`text.display`), "Shared by {display name}", and description.
- **Folders:** breadcrumbs plus child rows (DS-41).
- **Lists:** album rows or grid with service chooser buttons.
- **View options** apply for the visit only, with a note: "Your view settings aren't saved — sign in to keep them".
- **Footer:** "Sign in". No search UI.
- **Live updates** use the same subtle treatment (DS-82).
- **Unavailable or revoked link:** "This link isn't available. Ask the person who shared it for a new one." It reveals nothing about whether the content exists.
- **Link previews:** title, owner display name, and album count, with no artwork until G1 clears artwork use (decided 17 October 2026).

*As built in TON-70:*
- **The frame:** "Tonaris" in `text.title` at the top, and a "Sign in" link at the foot.
- **The header:** the container's name in `text.display`, "Shared by {name}" ("a Tonaris member" with no name), and the description.
- **A folder:**
  - breadcrumbs from the shared root, linking within the share;
  - its folders and lists, folders first and then by name, since the owner's arrangement isn't shared (FR-07.17);
  - each opens with `?c={id}`;
  - an empty one says "This folder is empty."
- **A list:** albums as rows (title, artist, year, Open) or a grid of cards. Rows are 56px with 44px artwork below 768px (DS-110). An empty list says "This list is empty."
- **View options:** segmented controls for Sort (Year, Name), Direction, Grouping (Not grouped, By type) and Layout (Rows, Grid).
  - They start from DS-44's defaults, so year ascending.
  - They're kept in the tab's session per link, under the note.
- **Open:** a popover of the album's services. Each opens in a new tab with `rel="noopener noreferrer"`. An album without links has none.
- **Live:** changes simply appear; DS-82's highlight isn't applied yet.
- **Unavailable:** the title "Not available" and DS-72's sentence.
- **Previews:**
  - the page title is "{name} · Tonaris";
  - `og:title` is the name;
  - `og:description` and `description` are "Shared by {name} · {n} albums", counting the whole share;
  - plus `twitter:card` summary and `robots: noindex`; no image.

---

## 10. Search palette

**DS-75 Command palette** (⌘K / Ctrl+K, or the sidebar Search item). *(FR-12.1–FR-12.5, FR-07.13)*

- **One palette for content and commands.** Typing searches content. Commands appear below content results and also match by name. Typing a leading `>` filters to commands only.
- **Result groups:** Folders · Lists · Albums · Shared with me · Commands. Up to 8 per group, with "Show all {n}" to expand within the palette.
- **Album results:** 24px artwork, title, artist, and year.
- **Container results:** icon and name.
- **Every result shows its location.**
  - Owned: "Metal › Doom".
  - Shared: an owner badge plus the accessible path only, e.g. "Anna K. · Doom (shared folder)". Private ancestors are never shown.
- **Highlighting:** the matched substring is highlighted, mapped through accent and case folding, so "bjork" highlights "Björk".
- **Opening results:** Enter opens a result; for albums, it opens the containing view with the inspector. ⌘Enter opens an album standalone.
- **Empty query:** recent items and frequent commands.
- **Mobile:** a search icon opens a full-screen search sheet with the same groups.

*As built in TON-61 (owned content):*
- **Opening it:** ⌘K or Ctrl+K, also from a text field, or the sidebar's Search item. ⌘K again or Esc closes it. Searching isn't an edit, so it works offline and in Viewing mode.
- **The palette:**
  - It sits 12% from the top, 640px wide, on the palette layer (DS-18).
  - Below 768px it fills the screen, inside the safe area. There is no mobile shell yet (DS-110), so the sheet opens with ⌘K or the sidebar's item.
  - Its field reads "Search, or type > for commands…" (TON-63).
  - With no match it says "No results for '{query}'."
- **Groups:** Folders, Lists, Albums, each with a heading, up to 8 results, then a "Show all {n}" option that expands the group in place.
- **Order within a group** (decided with the creator, 28 October 2026):
  - names that start with the query first;
  - then names with a word that starts with it (after a space or punctuation);
  - then any other match;
  - alphabetical within each tier, by search key.
  - An album ranks by the better of its title and its artist. Ties go by title, then artist.
- **Rows:**
  - A container: its icon, its name, and its location on the right: its folders' path ("Metal › Doom"), or "Collection" at the top.
  - An album, 48px: 24px artwork, its title, then "{artist} · {year}" below. Its location is the alphabetically first path of its lists, plus "+N more" when it is in others, or "Unsorted" (decided with the creator, 28 October 2026).
- **Highlighting:** the match is highlighted in `accent.soft` in each matched field, title and artist alike. A word-start match is preferred.
- **Keyboard:**
  - ↑ and ↓ move through the options, wrapping;
  - Enter opens the active one, or expands "Show all";
  - ⌘Enter opens an album on its own page;
  - the pointer moves the active option too.
- **Opening:**
  - a folder or list opens its view;
  - an album opens in its first list, or in Unsorted, with the inspector.
- **Screen readers:**
  - the field is a combobox over a listbox, with a group per heading;
  - the active option is `aria-activedescendant`;
  - a polite status gives the result count.

*As built in TON-63 (commands):*
- **Commands:** every action shortcut is a command (decided with the creator, 29 October 2026).
  - The list:
    - Go to Collection, Unsorted, Trash and Settings;
    - Hide sidebar or Show sidebar;
    - Switch to editing or Switch to viewing; View options;
    - Add albums from links, Add to list…, Open in…, Delete an album from the collection;
    - New list, New folder, Rename, Move to…, Delete a folder or list;
    - Restore, in Trash;
    - Keyboard shortcuts.
  - Pure navigation keys aren't commands: arrows, J/K, Home/End, Enter, Esc, ⌥↑/⌥↓, ⌘Enter, and ⌘K, which is the palette itself.
  - One list in code (`commands`) feeds both the palette and the reference, so they can't drift.
- **Rows:** a command row shows its name and its keys as `Kbd` chips. Typed text matches commands by name, below the content groups. `>` lists commands only, all of them for a bare `>`, with "No commands match '{text}'." when none do.
- **Acting on the focus:** a command acts on what had the focus when the palette opened, as its key would: the sidebar's focused folder or list, a view's focused row, the inspector's album or the focused album, Trash's focused row. Move to… and Rename also take the view's own folder or list.
  - It runs once the palette has closed, so the focus it returns can't steal from the dialog or name editor the command opens.
  - Opened from the sidebar's Search item, the focus is the button, so only the inspector's album and the view count.
- **Unavailable commands** stay listed, dimmed, with the reason, and choosing one does nothing:
  - "You're offline" for edits;
  - "Open or focus an album first";
  - "Focus a folder or list first";
  - "Focus an item in Trash first".
- **Rename** renames a folder or list in the sidebar's editor. An album's title keeps F2 in its row and the inspector's own field.
- **Empty palette** (decided with the creator, 29 October 2026):
  - **Recent:** the last 8 folders, lists and albums opened anywhere, newest first: a view's route, an album in the inspector, or an album's own page. Kept on this device (20 at most), per account. Ones deleted or in Trash drop out.
  - **Frequent commands:** the 5 commands run most from the palette on this device, ties in list order, topped up with Add albums from links, New list, Go to Unsorted, Switch mode and Keyboard shortcuts.

*As built in TON-72 (shared content):*
- **"Shared with me"** is a group after Albums and before Commands: shared folders, then lists, then albums, collapsed to 8 with "Show all".
- **Where they come from:** the server's search, 150 ms after typing stops, while online (decided with the creator, 29 October 2026).
- **Each row** reads "Shared by {name} · {path}". The path starts at the highest shared folder or list the person can see, so nothing private is named. A shared album shows its first shared list's path, "+n more" for others, and its letter tile.
- **Opening:** a shared folder or list opens in the viewer page (DS-70), from its shared root with `?c=`. An album opens its list there; ⌘Enter does the same.
- **"No results"** waits for the shared answer, reading "Searching…" until then.
- **Offline:** "Shared content isn't searched while offline." shows under the results.

---

## 11. Keyboard map

**DS-78 Shortcuts.** Shortcuts are disabled while a text field has focus, except ⌘K, Esc, and ⌘Enter. ⌘ is Ctrl on Windows and Linux. `?` opens a shortcut reference sheet. All shortcuts are also listed in the palette. *(Q-02, FR-12.2)*

| Keys | Action | Keys | Action |
| --- | --- | --- | --- |
| ⌘K | Command palette / search | `?` | Shortcut reference |
| C | Add album (capture) | N / ⇧N | New list / new folder |
| E | Toggle viewing/editing mode | V | View options |
| ↑↓ or J/K | Move focus | Enter | Open item / inspector |
| X | Select item | ⇧↑/⇧↓ | Extend selection |
| M | Move to… | L | Add to list… |
| ⌥↑/⌥↓ | Move in manual order | ⌥⇧↑/⌥⇧↓ | Move to top/bottom |
| O | Open in service… | ⇧S | Share… |
| F2 | Rename container / edit title | ⌫ | Remove from list (undo) / delete list (undo) |
| ⌘⌫ | Delete album from collection (confirm) | R | Restore (in Trash) |
| G then H / U / T / S | Go to root / Unsorted / Trash / Settings | `[` | Toggle sidebar |
| Esc | Close inspector or popover, clear selection | ⌘Enter | Submit form / open standalone |

*As built in TON-33:*
- **What works:**
  - G then H, U, T or S, within 1.5 s. S goes to Settings → Connections, the only settings page yet;
  - `[` and `?`;
  - N and ⇧N, and F2 in the tree;
  - the tree's arrows, Home, End and Enter.
- **Shortcuts come before the tree's type-ahead** (DS-27).
- **When they wait:** shortcuts are off in text fields, and inside dialogs, popovers and menus.
- **The reference** lists the shortcuts that work; others join it with their issues.
- **TON-34 adds the views' grid keys:** J and K, arrows across a row, and ⌘Home and ⌘End. J and K belong to the grid, not to global shortcuts, so in the tree they stay type-ahead letters.
- **TON-35 adds V,** which opens the current view's View options; it works offline, since choosing isn't an edit. **G then S** now goes to Settings → Preferences.
- **TON-36 adds M,** "Move to…", which waits while offline like N, and ⌥↑ / ⌥↓, with ⇧ for the ends, in the views' grids. The reference lists them.
- **TON-37 adds E,** which switches between Viewing and Editing, and F2 on an album row, which edits its title. M now switches to Editing first.
- **TON-47 adds O,** which opens "Open in…" for the inspector's album, else the focused album. Opening isn't an edit, so it works in Viewing mode and offline.
- **TON-45 adds C,** which opens the capture dialog, switching to Editing first and waiting while offline. The reference lists it as "Add albums from links".
- **TON-38 adds L,** "Add to list…", for the inspector's album, else the focused album, switching to Editing first and waiting while offline; **Enter** on an album, which opens the inspector; and **Esc,** which closes it. The reference lists them.
- **TON-61 adds ⌘K** (Ctrl+K on Windows and Linux), which opens search (DS-75). It works from a text field too, and in the palette it closes it. The reference lists it as "Search", and the sidebar's Search item carries it in `aria-keyshortcuts`.
- **TON-63 makes the reference complete,** built from the palette's command list plus the navigation keys:
  - It gains R ("Restore", under Trash) and ⌘Enter ("Submit a form; in search, open an album on its own").
  - Its sections are Moving around, Views, Albums, Folders and lists, Trash and Help.
  - Every action in it is a palette command with the same keys (DS-75).
- **TON-65 adds ⇧S,** which opens the sharing dialog (DS-65) for the focused folder or list, else the one on view. It works in Viewing mode, waits while offline, and isn't offered on a phone. The reference and the palette list it as "Share…".

---

## 12. Save states, sync, and live updates

**DS-80 Per-item save states.** *(FR-09.3, FR-09.4, FR-13.2, FR-13.3)*

| State | Visual | Behavior |
| --- | --- | --- |
| *pending* | Nothing for the first 300ms, then a 12px spinner in the item's trailing slot. The SyncIndicator shows "Saving…" | Non-blocking; the user keeps working |
| *confirmed* | The indicator disappears | No toast for ordinary edits |
| *failed* | The value rolls back. Danger icon in the slot, inline reason on the field. A persistent toast: "Couldn't save {what} · **Retry** · **Edit**" | Edit reopens the editor with the attempted value. Listed in Activity (DS-81) until resolved or dismissed. |
| *conflict* | The value rolls back to current. Warning icon. Persistent toast: "{What} changed while you were editing · **Review**" | Review opens the **ConflictView**: per field, **Current** (when it changed, and by which session or agent if known) beside **Yours**. Buttons: **Keep current**, which discards the attempt, and **Apply mine**, which resubmits against the current value |
| *unconfirmed* | Cloud-off icon in the slot. The SyncIndicator shows "{n} changes waiting to confirm" | Resolved automatically on reconnect into *confirmed*, *failed*, or *conflict*. A toast appears only if something didn't succeed |

*As built in TON-31:*
- **Markers.** `SaveStateMarker` and `useSaveState(key)` are ready for rows, cards and the inspector, which wire them in with their own issues (TON-33, TON-34, TON-38). Until then, Activity shows each write's marker. A pending marker appears after 300 ms through CSS, so rows need no timers.
- **The failed toast:** "Couldn't save {what}", with the server's reason and **Retry**. **Edit** and the inline reason on the field come with the editors (TON-33, TON-38).
- **The conflict toast:** "{What} changed while you were editing", then "Your change wasn't saved. Review both versions to choose.", with **Review**.
- **The ConflictView** is an alert dialog with a row per field: **Current** beside **Yours**.
  - **Keep current** has the focus, since it changes nothing.
  - **Apply mine** makes the change again through the collection, judged against the current value.
  - Closing it leaves the conflict in Activity.
  - When and by whom the current value changed isn't shown: the conflict outcome carries neither.
- **Failures are kept in the browser like conflicts.** They stay in Activity across reloads until retried or dismissed.
- **Restored writes raise no toast.** A write that was already failed or in conflict when the page loaded is carried by the indicator and Activity.

*As built in TON-32:*
- **More markers,** for a batch's writes (DS-84):
  - *skipped*: a dashed circle in `fg.tertiary`;
  - *needs input* and *needs approval*: a question circle in `status.warning`.
- **In a batch report,** a completed write shows a check in `status.success`. A confirmed write still shows nothing elsewhere (DS-02).
- **No toast of its own.** A write made with others in one action raises no toast. Its batch raises one (DS-84).

**DS-81 Sync indicator and Activity.** The SyncIndicator sits in the sidebar footer, in the mobile account menu, and as a small dot on guest pages. Clicking it opens **Activity**: a popover listing pending, failed, conflict, and unconfirmed items, plus open batch reports. *(FR-09.3, section 2.3)*

| Connection state | Indicator |
| --- | --- |
| *connected* | Neutral dot, no label; tooltip "Up to date". With saves in flight: "Saving…" |
| *reconnecting* | Warning dot, "Reconnecting…". Edits are still accepted as *pending*. |
| *offline* | Danger dot, "Offline — changes can't be saved". A slim banner in the main view reads "Offline — showing what was last loaded". Edit controls are disabled with the tooltip "You're offline". |

The tech spec defines the timing that separates *reconnecting* from *offline*.

*As built in TON-31:*
- **Offline** means the browser reports no network, or the stream has been down for 15 s (TS-24).
- **Before the first connection,** the dot is neutral and the tooltip says "Connecting…".
- **The label** follows the first state that applies:
  1. offline;
  2. reconnecting;
  3. "{n} changes waiting to confirm";
  4. "{n} need review", with a warning dot, while failures or conflicts wait (this keeps them in view once their toasts are closed, DS-02);
  5. "Saving…".

  A long label wraps rather than being cut off. The accessible name is "Sync status: {label}", or "Sync status: Up to date".
- **Activity** lists each write with:
  - its marker;
  - a summary, e.g. "Rename 'Metal' to 'Doom'";
  - its state, e.g. "Saving…", "Waiting to confirm", "Changed elsewhere", or "Couldn't save: {reason}";
  - its actions: **Retry** and **Dismiss** for a failure, **Review** for a conflict.

  Empty, it reads "All changes are saved.", or "Nothing is waiting to be saved." when not connected.
- **Waiting for their surfaces:**
  - the indicator in the mobile account menu, and the dot on guest pages;
  - edit controls disabled offline, which use `useConnection()` once there are edit controls.

*As built in TON-32:*
- **Batch reports.** Activity lists the open batch reports with the writes made on their own, oldest first. A write made with others shows only in its report (DS-84).
- **Size.** Activity is 384 px wide, and scrolls past 70% of the window's height.
- **Opened at a report.** A report's toast opens Activity at that report, with its header focused.
- **"{n} need review"** also counts skipped writes and those needing a choice.

**DS-82 Live updates from elsewhere.** *(FR-09.1, FR-07.11)*
- Rows changed by another session, agent, or owner get a 1.2s `accent.soft` background fade.
- New rows appear without motion when off-screen.
- Scroll stays anchored, and focus or selection stays on the same item even if it moves.
- **Concurrent edit in an open field:** an open editor is never overwritten. FR-09.4 applies on commit.
- **Item removed elsewhere:** an open inspector shows "This album was moved to Trash" (or "is no longer shared with you") with Close.

*As built in TON-31:*
- **Telling changes apart.** The client tells a change from elsewhere by the mutation that made it: one this tab didn't write.
- **The highlight.** `useLiveHighlight(key, ref)` puts the `.live-update` class on the row for each such change: a 1.2 s fade, or a static tint under reduced motion.
- **The rows** wire it in with their issues (TON-33, TON-34).

**DS-83 Announcements.** A polite `aria-live` region announces mode switches, moves and reorders, batch completion summaries, and restores. An assertive region announces failures, conflicts, and going offline. Routine confirmed saves are not announced. Pending items set `aria-busy` on their row. *(Q-02)*

*As built in TON-31:*
- **The regions.** The workspace renders both regions from its first render, and features announce through `useAnnounce()`.
- **Going offline** is announced as "You're offline. Changes can't be saved until the connection is back."
- **Failures and conflicts** are announced by their toasts.
  - The toasts have high priority, so Base UI renders them as alerts.
  - It keeps them out of the accessibility tree until F6 moves focus to them (DS-108).

*As built in TON-32:*
- **A batch that saves wholly** is announced politely: "{n} changes saved."
- **A batch that doesn't** is announced by its toast, an alert.
- **Later features** that announce their own outcome, such as a move's "Moved 5 lists to Metal", can replace the batch summary rather than add to it.

**DS-84 BatchOutcomeReport.** Results are grouped in this order: **Needs you** (uncertain matches, destination or name choices, approvals) · **Failed** · **Skipped** · **Unconfirmed** · **Pending** · **Completed**.
- Each item has its reason and its next action: Retry, Edit, Decide, or Enter manually.
- Inputs are kept until the item is resolved or dismissed.
- The report stays in Activity until dismissed.
- Its header line is the summary sentence, e.g. "9 added · 2 need you · 1 failed".

*As built in TON-32* (decided with the creator on 22 October 2026):
- **What a batch is.** The writes of one action, such as creating several lists or adding several albums to a list.
- **While it runs,** its report is in Activity, with its writes in their groups.
- **When it closes by itself.** When every write saves, the report closes by itself, and its summary is announced (DS-83).
- **When it stays.** When any write fails, is skipped or needs the person, the report stays until dismissed. It survives reloads, and keeps the inputs.
- **The groups:**
  - their headings are Needs you, Failed, Skipped, Waiting to confirm, Saving and Completed, each with its count;
  - Completed is folded by default;
  - a conflict is under Needs you, since it needs a decision.
- **The summary sentence** leads with what saved, then follows the groups' order and leaves zero counts out, e.g. "2 saved · 1 failed · 1 skipped".
- **The header** folds the report. Beside it:
  - **Retry all**, for two or more failures;
  - **Dismiss**, once the report stays.
- **Each item** shows:
  - its marker;
  - its summary, e.g. "New list 'Doom'";
  - its reason. A skipped item names what it waited for: "Waits for the folder 'Later', which couldn't be saved. Retry it to save this too."
- **Next actions:**
  - **Retry** for a failure. It makes the change again with the items skipped because of it, and the new writes take the old ones' place in the report. Nothing completed is sent again.
  - **Review** for a conflict.
  - **Edit**, **Decide** and **Enter manually** come with the editors, choices and capture (TON-38, M3, M5).
  - *As built in TON-45:* a capture's failure offers **Retry** and **Enter manually**. One asking for details offers Enter manually, and one fitting several albums the folded decision card, with **Decide**. Activity's own items do the same, with Dismiss.
- **The toast.** A batch that settles with anything unsaved raises one persistent toast instead of one per write:
  - "Couldn't save 2 of 4 changes";
  - the summary sentence;
  - **View report**, which opens Activity at the report.

  It closes once nothing settled in the report is left unsaved.

*(FR-13.4, FR-02.10, FR-02.11)*

---

## 13. MCP connections and approvals

**DS-85 Connection consent** (`/oauth/consent`). *(FR-10.1–FR-10.3, X-03)*
- **Header:** "{Client name} wants access to your Tonaris collection". The client's domain is shown, and names the client supplies are labelled "as provided by the client".
- **Signed in as:** shows the account's email.
- **Mode choice:** radio cards, with **Read-only** preselected.
  - **Read-only:** "Read and search your collection and Trash. Can't change anything."
  - **Manage collection:** "Add, edit, move and organize. Deleting, removing used options and deleting fields always need your approval in Tonaris. Sharing, account settings, export and permanently deleting Trash stay in the app."
- **Buttons:** Connect / Cancel.

**DS-86 Settings → Connections.**
- A list of connections showing client name, mode, connected date, last used, and **Revoke**. Changing the mode means reconnecting.
- **Waiting for your approval ({n})** lists pending approvals with links to DS-87.
- **Setup instructions** for Claude web, ChatGPT web, and Codex desktop: the MCP server URL with Copy, and 3–4 steps each.

*(FR-10.1, FR-10.3)*

**DS-87 Approval page** (`/approvals/:id`). The signed-in owner only; a different account sees "This request belongs to another account". *(FR-10.6, FR-02.9, FR-07.14, X-07)*

- **Header:** "Approve request from {connection name}".
- **Summary sentence:** for example "Move 3 lists and 1 folder (12 lists inside) to Trash".
- **Scope:** an expandable list.
- **Consequences:** SharingImpact, album retention or removal, and recoverability.
- **Expiry:** "Expires in 9:42". The page stops accepting decisions at expiry.
- **Buttons:** **Approve** (danger variant for deletions) and **Decline**.
- **Uncertain-match variant:** the DS-48 decision card, with **Same album** / **Different album** / **Decline**.
- **After a decision:** "Approved — return to {client} to continue" or "Declined". Revisiting the page shows the recorded decision. An expired or already-used request is explained, and nothing happens.
- **Mobile:** the page is fully responsive and usable. Approving authorizes an MCP operation, so it isn't a browser collection edit (FR-10.6, X-04).

---

## 14. Accounts, settings, and admin

**DS-90 Sign-in.** *(FR-11.1, FR-11.2)*
- **`/sign-in`:** an email field and **Continue**.
- **`/sign-in/verify`:** "Check {email}". It has a 6-digit code input that supports `autocomplete="one-time-code"` and paste, plus the line "Or open the link in the email to sign in on that device". There is a resend button with a 30s cooldown and "Use a different email".
- **The same screen appears for any email.** Unknown or unadmitted addresses get an explanatory email instead, so the UI reveals nothing.
- **Email link:** it opens `/sign-in/verify` and submits the same code automatically (TS-70), then lands on the original destination.
  - Opened on a different device or browser from the one that asked: the page first asks "Sign in on this device?" with **Sign in** and **Cancel**.
  - Expired or used: "This sign-in link has expired or was already used" with **Send a new code**.
- **Messages** (as built in TON-9):
  - wrong code: "That code isn't right. Check the email and try again.";
  - expired code: "This code has expired. Send a new code.";
  - too many wrong codes: "Too many wrong codes. Send a new code.";
  - sign-in limit reached (TS-104): "Too many sign-in attempts. Try again in {n} minutes.";
  - API unreachable: "Couldn't reach Tonaris. Check your connection and try again.";
  - after a resend: "We sent a new code to {email}.";
  - on another device: "This link signs in to Tonaris as {email}." under "Sign in on this device?".
- **The code field** accepts a pasted code with spaces or a dash, and six digits submit by themselves.

**DS-91 Admission landing** (`/join/:admissionToken`). *(FR-11.2, FR-11.6, FR-11.3)*
1. "You're invited to Tonaris", showing the bound email.
2. **Continue** sends a code to that email and leads to the verify screen.
3. An optional display-name step ("You can add this later").
4. First-run empty state (DS-105).

Invalid, revoked, expired, already-used, or paused invitations each get one plain sentence explaining the status, and nothing else. *As built in TON-24:*
- invalid: "This invitation link isn't valid.";
- revoked: "This invitation has been withdrawn.";
- expired: "This invitation has expired. Ask for a new one.";
- already used: "This invitation has already been used. If you joined with it, sign in.";
- paused: "Tonaris isn't accepting new members right now. Your invitation will work again when it reopens."

**The code email** ("Your code to join Tonaris") links to `/join/:admissionToken#code=…`, which submits the code like the sign-in link does (DS-90).

*As built in TON-75:*
- **The landing:** "You're invited to Tonaris", then "This invitation is for {email}. Continue, and we'll email a code to that address." and **Continue**. Nothing is sent until Continue.
- **The code step:** "Check {email}", with the sign-in page's code field and "Or open the link in the email to join on that device." It has **Join** and "Resend code" after 30 seconds, and no "Use a different email", since the invitation is bound to the address. Code errors read as on sign-in (DS-90).
- **The code link:** in the browser that asked, it shows "Creating your account…" and joins. Elsewhere it first asks "Join on this device?" with "This link creates your Tonaris account for {email}." and **Join** and **Cancel**. A spent link shows "This link has expired or was already used" with **Send a new code**.
- **The name step:** "Add a display name" and "People you share with see this name instead of your email. You can add this later." It has a "Display name" field, **Save**, and **Skip for now**. Saving a blank name says "Enter a name, or skip this for now.". Someone who already has a name skips the step.
- **Then** the collection's first run (DS-105).
- **An unusable invitation:** its sentence is the page's heading, alone. A refusal that arrives later, such as a pause before the code is entered, replaces the step the same way.
- **Rendering:** the page is rendered in the browser. Its URL carries the token, so it sends no Referer, as guest pages don't.

**DS-92 Settings layout.**
- **Subnav:** Profile · Account · Preferences · Custom fields · Connections · Data.
- **Admin:** appears only for the creator.
- **Danger zone:** at the bottom of Account.

*(FR-11.13)*

*As built in TON-35:* the subnav is a row of links under each settings page's header, the current one underlined in `accent.solid` and marked `aria-current="page"`. It lists the pages built so far, Preferences and Connections; the others join with their issues. Custom fields joined between them in TON-53, and Data after Connections in TON-60. Profile joined first in TON-76, and Account second in TON-77. The account menu's Settings still opens Preferences.

**DS-93 Profile and account.** *(FR-11.3, FR-11.4, FR-11.5)*
- **Display name:** saved on blur. While sharing is on, clearing it shows an inline error that keeps the current value.
- **Change sign-in email:** a stepper with three steps:
  1. Enter the new address.
  2. Enter the code sent to the **current** address.
  3. Enter the code sent to the **new** address.

  Then "Done — use {new} to sign in". Cancelling at any step changes nothing.
- **Lost access to your email?** is a link from sign-in and Account to `/help/recovery`. That page explains creator-assisted recovery and shows the support contact address (TS-73). There is no in-app request form.

*As built in TON-77* (Settings → Account, second in the subnav):
- **"Sign-in email"** shows the address and **Change sign-in email**.
- **The stepper** sits in a bordered box headed "Step n of 3":
  1. a "New email address" field and **Continue**;
  2. "Check {current}" with the code field, hinted "We sent a code to your current address, to confirm it's you.", and **Continue**;
  3. "Check {new}", hinted "We sent a code to the new address, to confirm it's yours.", and **Change email**.
- **On steps 2 and 3:** six digits submit by themselves, "Resend code" becomes available after 30 seconds, and **Cancel** is on every step.
- **Refusals** show under the field:
  - "Enter an email address, such as anna@example.com.";
  - "That's already your sign-in email.";
  - "That address belongs to another Tonaris account.";
  - "There's no email change in progress. Start again.";
  - and DS-90's code messages.
- **Done:** "Done — use {new} to sign in." shows under the new address, and the account menu follows.
- **Resuming:** a change in progress resumes at its step after a reload.

*As built in TON-78* (the help page):
- **The link:** "Lost access to your email?" sits under the sign-in email step and beside **Change sign-in email** on Settings → Account.
- **`/help/recovery`** is public, in the sign-in card. It has the heading "Lost access to your email?", explains that the creator can move the account to a new address, and says to write to the `SUPPORT_EMAIL` address (a mailto link) from the address the person uses now. It closes with "Back to sign in".
- **The recovery email's link** opens `/recover/:token`, "Confirm your new sign-in email". The code is filled from the link, under the hint "Confirming moves your Tonaris account to the address this email came to, and signs it out everywhere." After **Confirm** comes "Done — use {email} to sign in." with **Sign in**. Refusals show under the field, such as "This recovery link isn't valid. Ask the creator for a new one."

*As built in TON-76* (Settings → Profile):
- **Display name** is a field with the hint "People you share with see this name instead of your email. It's optional until you share."
- **Saving:** a change is saved when the field loses focus, or on Enter, and "Saved." follows. The account menu shows the new name at once, or the email once the name is cleared.
- **While sharing,** clearing it is refused with "People you share with see your display name. Stop sharing to clear it." under the field, and the field shows the saved name again.

**DS-94 Preferences.** Default sort and direction for lists, default sort for folders, default grouping, and default layout. A note explains that remembered per-view choices are kept when defaults change. *(FR-11.7)*

*As built in TON-35:*
- **Two sections,** with the same segmented controls as View options:
  - **Lists and Unsorted:** sort, direction, grouping and layout;
  - **Folders and Collection:** sort and direction. Folders have a direction too, since Name and Created sort both ways.
- **Each choice is saved at once** to the account, and reaches the person's other sessions.
- **The note:** "Folders, lists and views where you've chosen options in View options keep them when you change these defaults. Choose "Use account defaults" there to follow these again."

**DS-96 Data export** (Settings → Data). *(FR-08.1–FR-08.6)*
- **Explanation:** "A ZIP with a JSON file (complete, for programs and AI tools), a Markdown file (readable outline of your collection) and a README."
- **Included / not included:** a short two-column list (FR-08.3, FR-08.4).
- **The "Download your data" button** has three states:
  - **Preparing:** indeterminate progress and "Preparing your export…", which can be navigated away from; the state persists in Activity.
  - **Ready:** the download starts automatically, with a "Download again" link while it's available.
  - **Failed:** the reason plus **Retry**.

**DS-97 Account deletion** (Account → Danger zone). *(FR-11.10, FR-11.11, FR-08.7)*
- A full-height dialog lists the consequences (FR-11.10).
- A **Download your data first** block embeds the DS-96 states.
- To confirm, the user types their sign-in email (paste allowed) and presses **Delete account permanently**.
- A progress state follows, then the user is signed out to a plain "Your account has been deleted" page.
- Failure shows the reason and retry, without claiming partial success.

*As built in TON-79* (without the export block, which TON-89 adds):
- **The Danger zone** is the last section of Settings → Account, under a rule: "Deleting your account removes it and everything in it, for good." with **Delete account** (danger). The creator reads "The creator's account can't be deleted: it runs admissions." instead.
- **The dialog,** "Delete your account?", says "Deleting your account means:" and lists:
  - "Your whole collection is removed permanently, including Unsorted and Trash.";
  - "Your settings, and the shares saved to Shared with me, are removed.";
  - "Everything you share becomes unavailable to everyone, including people with a link.";
  - "Your AI connections are disconnected.";
  - "It can't be undone: nothing goes to Trash, and the account can't be recovered.".
- **Confirming:** "Type {email} to confirm" enables **Delete account permanently** once the typed email matches, whatever its case. **Cancel** closes it.
- **`/account-deleted`:** "Deleting your account…" with an indeterminate bar, then "Your account has been deleted" and "Everything in it is gone. Thanks for using Tonaris.". A failure reads "Couldn't finish deleting your account" and "Try again to finish it.", with **Retry**.

**DS-98 Usage meter.** Settings → Data shows "4,812 of 5,000 albums · 37 in Trash", with a bar split into active and trashed. *(FR-15.2, FR-15.3)*
- At 95% or more, a quiet notice appears in capture surfaces.
- At the limit, capture shows "You've reached 5,000 albums (including Trash). Permanently delete albums from Trash or remove albums to add more", with links.

*As built in TON-60:*
- **Settings → Data**, under "Usage", reads "2 of 5,000 albums · 1 in Trash" (without the Trash part at zero).
  - A native meter ("Albums used") serves assistive technology; the bar is split into active (`accent.solid`) and trashed (`fg.tertiary`).
  - The note says: "Albums in Trash count until they are deleted permanently. Restoring an album reuses its place."
- **The capture dialog and manual entry** show the usage line from 95%, and the refusal's words at the limit (as an alert). Both have "Open Trash" and "See usage" links.

**DS-100 Creator admin** (`/admin/admissions`, desktop). *(FR-11.6)*
- **Header:** a switch labelled "Accepting new members" (on / paused), with status text.
- **Invite:** an email input.
- **Table columns:** email, status (available / redeemed / revoked / expired), created, expires, email delivery (sending / sent / failed · Resend), and a **Revoke** action.
- **Pausing** shows the note "Existing members keep access; outstanding invitations stay as they are".
- **Recover sign-in email** (on a user's row):
  1. The creator enters the new address and a reason.
  2. Tonaris sends a verification to the new address. The row shows *waiting for verification* until it completes.
  3. A checkbox, "Also disconnect AI connections", is off by default.

  Every recovery is audit-logged. The user list shows only email, display name, and join date, never collection data. *(FR-11.5, TS-73)*

*As built in TON-78* (Admin → Members, a tab beside Admissions):
- **The intro:** "Recover a sign-in email only once you're sure the account is theirs. The new address confirms it before anything changes, and the reason goes in the audit log."
- **The table** has columns Email, Display name, Joined, and Recovery ("Waiting for verification · {new}" or "—").
  - Each row has **Recover sign-in email**.
  - A waiting row also has **Cancel recovery**.
- **The dialog,** "Recover sign-in email", has:
  - "New email address";
  - "Reason", hinted "How you confirmed it's theirs. It goes in the audit log.";
  - "Also disconnect AI connections", off;
  - **Send verification**.
- **Refusals** show in the dialog: the new address isn't an address, is already theirs, or belongs to another account, or the reason is blank.

*As built in TON-74* (Admin → Admissions):
- **Reaching it:** Admin in the account menu, for the creator only, opens `/admin/admissions`. For anyone else, the URL shows "Page not found".
- **The switch,** in a bordered row, reads "Accepting new members". Its status text is "On: people you invite can join." or "Paused: no one can join until you turn this back on." While paused, the note "Existing members keep access; outstanding invitations stay as they are." sits under it.
- **Invite** has a heading and the line "The invitation works once, only for this address, and expires in 14 days." The email input is labelled "Email address to invite", with an Invite button.
  - A refusal keeps the typed address, with the reason under it:
    - "{email} already has a Tonaris account.";
    - "{email} already has an invitation. Resend it, or revoke it to invite them again.";
    - "Enter an email address, such as anna@example.com.".
- **The Invitations table** has columns Email, Status (Available, Redeemed, Revoked, Expired), Created, Expires, and Email delivery (Sending…, Sent, Failed, Not confirmed).
  - **Resend** shows on an available invitation whose email failed or wasn't confirmed. It sends a new link, and the earlier one stops working.
  - **Revoke** shows while an invitation is available.
  - While an email is sending, the page reloads every 2 seconds until the outcome shows.
  - On a narrow window, the table scrolls sideways inside its frame.
  - With none yet, the section reads "No invitations yet."

---

## 15. States, copy, and mobile

**DS-105 Empty states.** One sentence and one action. *(FR-01.9, FR-12)*

| View | Copy | Action |
| --- | --- | --- |
| Root (first run) | "Start your collection — paste an album link or create a list." | New list |
| List | "No albums yet. Paste a Spotify, Apple Music, Qobuz or Tidal link." | Add album |
| Unsorted | "Albums that aren't in any list show up here." | — |
| Shared with me | "Collections people share with you appear here." | — |
| Trash | "Nothing in Trash. Deleted items stay here for 30 days." | — |
| Search | "No folders, lists, artists or albums match "{q}"." | — |

*As built in TON-33*, until the rows (TON-34):
- **Each view summarizes what it holds,** e.g. "2 folders and lists" or "12 albums".
- **An empty folder** reads "This folder is empty." · New list.
- **A list's** Add album waits for capture and manual entry (M3, TON-38).

The root's first-run state also offers a secondary action, "Connect an AI assistant", which links to Settings → Connections. *As built in TON-75:* a ghost link beside New list.

**DS-106 Loading.** *(Q-01)*
- **First load:** a shell skeleton (sidebar, header, rows) until the collection snapshot is ready.
- **After that:** no spinners or skeletons for navigation within loaded data.
- **Guest pages** are server-rendered with content.
- **Artwork** shows the fallback tile, then fades in (DS-23).
- **Lists of 100 rows or more** are virtualized, with a fixed row height and overscan for smooth scrolling.

**DS-107 Copy tone.** Plain, specific, blameless, and action-first. Sentence case, no exclamation marks. Name the thing and offer one way forward. Use "Couldn't…", not "Error:"; never use "Oops". *(FR-13.1)*

| Situation | Copy |
| --- | --- |
| Unsupported link | "This doesn't look like a Spotify, Apple Music, Qobuz or Tidal album or track link." · Enter manually |
| Tidal track link | "Tonaris can't tell which album this Tidal track is on. Enter the album — the link is kept." · Enter manually |
| Lookup failed | "Couldn't reach Apple Music. Your link is saved here — try again or enter details manually." |
| Not permitted | "You can view this shared list but not change it." |
| Name taken | "'Favorites' already exists in Metal. Choose another name." |
| Service can't open | "Couldn't open Qobuz or its website for this album." |

*As built in TON-32:*
- **Name taken.** The server refuses a taken name with this copy, or "'Favorites' already exists at the top level. Choose another name." at the root.
- **Without the server's explanation,** a failure shows its code's sentence, e.g.:
  - "You're signed out. Sign in again to save this change.";
  - "Too many changes at once. Wait a moment, then retry.";
  - "Tonaris couldn't save this change. Try again."

  The sentences live in `describe.ts`, one for every error code.

**DS-108 Toasts.**
- Shown bottom-right, at most 3 visible.
- Durations: info 4s, undo 8s. Failures, conflicts, and anything needing a decision persist until dismissed.
- Toasts pause on hover or focus, and are reachable with F6 and from Activity.

*As built in TON-32:*
- **One API.** Features raise toasts through `useNotify()`, which knows three kinds:
  - **information**, gone after 4 s;
  - **undo**, gone after 8 s. Its **Undo** undoes and closes it;
  - **problem**, which stays until closed and is announced as an alert.
- **Reachable from Activity.** Only problems persist, and what each reports (a failure, a conflict, a batch report) is always in Activity.

*(FR-13.3)*

**DS-110 Mobile web** (below 768px; iOS Safari, Android Chrome). *(Section 2.2, X-04, FR-05.2, FR-06.5, FR-12.2)*
- **Navigation:** drill-down. A top bar has Back, the title, Search, and Account. The root screen lists Collection containers, then Unsorted and Shared with me.
- **Trash, Settings → Custom fields, sharing management, and admin** are not shown on mobile.
- **Album rows** are 56px with 44px artwork. Tapping one opens a read-only detail sheet with Open buttons for each service.
- **View options** open in a bottom sheet: sort, direction, grouping, layout. There is no rearranging; manual order is displayed as saved.
- **Approval pages** (DS-87) and sign-in are fully supported.
- Safe-area insets are respected, inputs use 16px text, and the touch target minimum is 44px.

---

## 16. Accessibility and perceived performance

**DS-115 Accessibility baseline: WCAG 2.2 AA.** *(Q-02)*
- **Focus ring:** 2px `accent.solid` with a 2px offset on every interactive element. Mouse clicks show none, using `:focus-visible`.
- **Patterns:** the sidebar uses the ARIA tree; collections use `grid` with `aria-rowcount` and `aria-rowindex` under virtualization. Dialogs trap focus and return it to the trigger. The palette follows the combobox/listbox pattern.
- **Every drag has a keyboard path** (DS-49).
- **Status is never color-only:** states always combine an icon and text.
- **Reduced motion** is honored (DS-17).
- **Screen-reader walkthroughs** cover guest pages, failure states, and approval pages.

*Fixed in TON-34:* the focus ring never showed, from TON-7 on.
- **The cause.** Tailwind v4's `outline-none` sets the outline style to `none`, and `focus-visible:outline-2` inherits that style.
- **The fix.** Every ring now adds `focus-visible:outline-solid`.
- **The guard.** A browser test checks a keyboard-focused button and a focused card. axe doesn't check focus visibility.

**DS-118 Perceived speed.** *(Q-01, FR-09.3)*
- Apply locally first (DS-01).
- Keep the command palette and inspector open-time imperceptible, with no network on open.
- Fix artwork and row sizes so nothing shifts layout.
- Prefetch guest and SSR routes on hover.
- Never block input on a save.

The tech spec sets the measurable targets (Q-01, pending approval).

---

## 17. Design decisions log

No design questions are open. The creator settled these on 17 October 2026, and rows 10 and 11 on 18 October 2026:

| # | Question | Decision |
| --- | --- | --- |
| 1 | Accent hue (DS-12) | Violet-indigo, OKLCH 0.66 0.17 275 |
| 2 | Grid layout (DS-40) | Rows and Grid both ship in v1, built together from the start |
| 3 | Custom-field columns in album rows | After v1. In v1, field values appear in the inspector only |
| 4 | First-time default sort for lists and Unsorted (DS-44) | Chronological, ascending |
| 5 | Approval pages on mobile (DS-87) | Yes, fully usable |
| 6 | Lost-email recovery (DS-93, DS-100) | A help page with a contact address; the creator performs the recovery from Admin |
| 7 | Link-preview artwork (DS-72) | Text-only until G1 clears artwork use |
| 8 | Wordmark and app icon (DS-19) | A simple text wordmark |
| 9 | Typed confirmation for account deletion (DS-97) | The user types their sign-in email |
| 10 | Input borders below 3:1 (DS-12, DS-14), 18 Oct 2026 | Raise `border.strong` to 0.52, reaching 3:1 on every surface |
| 11 | Primary button labels below 4.5:1 on the accent (DS-12, DS-14), 18 Oct 2026 | New `accent.fill` (0.54 0.17 275) behind near-white `fg.on-accent` labels; `accent.solid` stays for focus and selection |

New questions are added here as **Open (design)** rows.

## 18. Traceability

| PRD area | Design decisions |
| --- | --- |
| FR-01 Lists, folders, Unsorted, Trash | DS-27, DS-31, DS-41–DS-45, DS-49–DS-51, DS-55–DS-57 |
| FR-02 Capture | DS-47, DS-48, DS-84 |
| FR-03 Metadata and custom fields | DS-24, DS-26, DS-46, DS-60 |
| FR-04 Modes | DS-45 |
| FR-05 Sorting, grouping, manual order | DS-24, DS-42–DS-44, DS-49, DS-51, DS-94 |
| FR-06 Service links | DS-25, DS-46 |
| FR-07 Sharing | DS-65–DS-70, DS-72 |
| FR-08 Data export | DS-96, DS-97 |
| FR-09 Synchronization | DS-80–DS-83 |
| FR-10 MCP | DS-85–DS-87 |
| FR-11 Accounts and settings | DS-90–DS-94, DS-97, DS-100 |
| FR-12 Search | DS-75 |
| FR-13 Errors and outcomes | DS-80, DS-84, DS-107, DS-108 |
| FR-14 Album deletion and recovery | DS-50, DS-56 |
| FR-15 Capacity | DS-98 |
| Q-01 Performance | DS-01, DS-106, DS-118 |
| Q-02 Accessibility | DS-03, DS-14, DS-17, DS-27, DS-49, DS-83, DS-115 |
| Q-10 Experience direction | DS-04, DS-10–DS-20 |
| X-04 Device scope | DS-07, DS-45, DS-110 |
| X-07 Confirmations | DS-05, DS-28, DS-50, DS-57 |
