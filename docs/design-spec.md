# Tonaris — Design spec

| | |
| --- | --- |
| Status | Draft v0.1 |
| Updated | 18 October 2026 |
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
- Artwork, service logos, and status colors are tested against dark surfaces only for now.

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

- The accent hue is a cool violet-indigo (decided 17 October 2026). It stays distinct from Spotify green, Apple red, and Qobuz blue in service icons.
- Brand colors appear only inside service logos.

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

**DS-19 Iconography.**
- **Lucide** at 16px with a 1.5 stroke; 14px inside dense rows and chips. It is consistent, tree-shakable, and matches the shadcn defaults.
- **Service marks** use each service's official logo asset at 14–16px, following each brand's guidelines. Any attribution required for provider-sourced content is shown wherever that content appears (pending G1).
- Release types are written as text, not icons.
- **Branding:** a text wordmark, "Tonaris" in Inter semibold. The favicon and app icon are a "T" mark on the accent color.

---

## 3. Components

**DS-20 Base layer.**
- Use the shadcn CLI v4 **TanStack Start template with Base UI primitives**. Components are copied in and restyled to DS-10 to DS-19.
- Never introduce an unstyled third-party component without wrapping it in the system.
- Supporting libraries:
  - **cmdk** for the command palette;
  - **Sonner** for toasts;
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
| Feedback | Sonner, Skeleton, Progress, Badge | See DS-80 to DS-84 |
| Navigation | ScrollArea, Tabs, Separator | Tabs in Settings and Admin only |
| Palette | Command (cmdk) | See DS-75 |

**DS-21 Album row.** This is the desktop list item: 36px high and virtualized. Columns, in order:

1. selection checkbox (editing mode, DS-44);
2. drag handle (editing mode with manual sort only);
3. 28px artwork;
4. title, plus an edition chip when known;
5. artist credit (`fg.secondary`);
6. chronology year (tabular, DS-24);
7. release type in text (`fg.tertiary`; hidden when grouped by type);
8. service availability glyphs;
9. a trailing save-state slot (DS-80).

On hover or focus a trailing "Open" button appears; it opens the service chooser (DS-25). Columns collapse from the right as the width shrinks: type, then services. *(FR-05, FR-06.5, FR-09.3)*

**DS-22 Album card.** This is the grid item. A square artwork tile (160–200px, responsive columns) sits over the title and artist, each truncated to one line, then the year. The edition chip shows on hover or focus. Save state appears as a corner badge. *(FR-05)*

**DS-23 Artwork.**
- A fixed-aspect box with lazy loading, `decoding="async"`, a `sizes`/`srcset` where the source allows it, and a 150ms fade-in.
- **Fallback tile:** a neutral surface with the first letter of the title and a hue derived from a hash of the title, desaturated to stay calm. The same tile is used when artwork is missing, still loading, or fails to load. A failed load is never shown as an error. *(FR-03.4)*
- **Alt text:** decorative (`alt=""`) in rows and cards, where the title is adjacent; "Cover of {title}" in the inspector and on guest album sheets.

**DS-24 Chronology display.** *(FR-05.5, FR-05.6, FR-02.8)*

| Case | Display |
| --- | --- |
| Non-live release | Original release year, e.g. `1994` |
| Live, recording year known | Year or full range, e.g. `1978–1982`, with a small `rec.` prefix in `fg.tertiary` |
| Live, recording year unknown | Release year with a fallback marker, e.g. `1979 ·` plus a "release-year fallback" glyph; tooltip and accessible label: "Recording year unknown — sorted by release year" |

The edition's own release date never appears in the year column. It appears in the inspector's Info section, labelled "Edition released".

**DS-25 Service-link chooser.** "Open in…" lists only the services that have a link, each with its logo and name ("Open in Spotify").
- **Desktop:** a popover anchored to the Open button or invoked with `O`. The first item is focused, and Enter opens it.
- **Mobile:** a bottom sheet.
- **No preselection** and no remembered choice. *(FR-06.5)*
- **Single link:** the popover still appears, with one item. This keeps the explicit choice consistent.
- **Failure:** if neither the app nor the web destination can open, an inline message replaces the item list (DS-107). *(FR-06.6)*

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

**DS-27 Tree navigation.**
- The sidebar tree follows the ARIA `tree` pattern with roving tabindex. ←/→ collapses and expands, ↑/↓ moves, and Enter opens. Type-ahead jumps to an item by name.
- Folders show a disclosure chevron. Lists show an album count in `fg.tertiary`.
- Shared containers carry a small sharing glyph (DS-31).
- Drop targets highlight with `accent.soft` during drags (DS-49).
- Expansion state is per device and is not synced.

*(FR-01.1, FR-01.3, Q-02)*

**DS-28 Standard confirmation dialog.** Built on AlertDialog. It is used for every *confirmed* operation (X-07). *(X-07, FR-07.14)*

1. **Title:** the verb and target, e.g. "Delete folder 'Metal'?"
2. **Scope block:** a bulleted summary with counts; long lists are expandable.
3. **Consequences block:** what stays (albums remain in other lists or Unsorted), sharing effects through `SharingImpact` (DS-69), and recoverability ("Recoverable from Trash for 30 days" or "This can't be undone").
4. **Buttons:** Cancel (default focus for irreversible actions) and a primary button naming the action and scope, e.g. "Move 1 folder and 6 lists to Trash". The primary button uses the danger variant when the action is irreversible.

Typed confirmation is reserved for account deletion (DS-97).

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

*(FR-01.3, FR-12.2)*

**DS-31 Sidebar contents, top to bottom.** *(FR-01.9, FR-01.12, FR-07.6, FR-07.13, FR-11.6, FR-12.2)*

1. **Account menu:** display name or email, Settings, Admin (creator only), keyboard shortcuts, Sign out.
2. **Search**, labelled with ⌘K.
3. **+ Add album.**
4. **Collection:** the root's folders and lists in the owner's root order.
5. **Unsorted**, with count.
6. **Shared with me:** references grouped under each owner's display name. Invitation-based and link-saved references show distinct glyphs.
7. **Invitations**, visible only when pending invitations exist, with a badge.
8. **Trash**, with count.
9. **Footer:** the SyncIndicator.

Shared containers in the user's own collection carry a sharing glyph: people, link, or both. Inherited sharing uses a dimmer glyph variant.

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

---

## 5. Collection views

**DS-40 Layouts.**
- Lists and Unsorted offer **Rows** (default) and **Grid**. Folders and the root always use rows.
- The layout choice is saved with the view's other personal presentation choices.
- Both layouts ship in v1 and are built together from the start (decided 17 October 2026).

*(FR-05.2)*

**DS-41 Folder and root rows.** Each row shows the container icon (folder or list), name, a description excerpt (`fg.tertiary`, one line), the item count (albums for lists, children for folders), and a sharing glyph. When sorted by creation date, a date column appears. *(FR-01.3, FR-03.5, FR-05.1)*

**DS-42 Lists and folders under each sort** *(handoff FR-05.1)*:
- **Name and creation-date sorts:** folders first, then lists, each sorted by the selected key and direction. This is the filesystem convention and keeps hierarchy scannable.
- **Manual sort:** one mixed sequence in the person's arrangement.

**DS-43 Group sequence and headers** *(handoff FR-05.7)*:
- Sequence: **Album → EP → Live → Compilation → Unclassified.** Core studio work comes first and unknowns last.
- Sticky 28px headers show the group name and count (`text.small`, `fg.secondary`).
- Empty groups are hidden.
- Groups can be collapsed per session; collapse state is not synced.

**DS-44 Initial presentation** *(handoff FR-05.10)*. Saved defaults and remembered choices always win (FR-11.7).

| Context | First-time default |
| --- | --- |
| Lists, Unsorted | Chronological year, ascending; combined (no grouping); Rows |
| Folders, root | Manual order |
| Shared views (viewers, guests) | Same defaults; guests always start from these (FR-11.9) |
| Mode on entry (desktop owner) | Viewing (DS-45) |

- **Folders and root:** with no arrangement yet, manual order falls back to creation order. This makes the sidebar tree the user's own arrangement.
- **Manual order before anyone arranges a list:** for a person who hasn't arranged a list, it falls back to the order in which albums were added to that list, oldest first. A viewer's manual order never starts from the owner's arrangement (FR-05.2).

**DS-45 Viewing and editing modes.** These reconcile FR-04 with a Linear-like feel: the mode controls chrome, and edit intent switches modes. *(FR-04.1, FR-04.2)*

- **Viewing** is the default. It shows a clean list or grid: no checkboxes, drag handles, add-rows, or inline-edit affordances. The inspector shows values read-only.
- **Editing** shows checkboxes, drag handles (manual sort only), "+ Add album" at the end of a list, and inline-editable cells (title, artist, year on double-click or Enter). Inspector fields become editors.
- **Toggle:** a segmented control in the view header (`View | Edit`) and the shortcut `E`.
  - The mode is app-wide, persists per device, and is not synced.
  - The active mode is always visible in the header. Editing mode also tints the header's bottom border with `accent.solid`.
- **Edit intent switches the mode.** Pressing an editing shortcut (`C`, `M`, `L`, `⌫`, rename), using an edit command from the palette or context menu, or pasting a link in viewing mode switches to Editing first. A polite live region announces "Editing mode on".
- **Leaving editing mode** with an inline edit open: a valid value is committed (normal save states apply); an invalid value keeps the editor open with its error, and the mode does not switch until the user fixes or discards it.
- **No toggle** appears for viewers of shared content (a "View only · Shared by {name}" pill instead) or on mobile.

**DS-46 Album inspector.** It opens with Enter or a click on a row, shows the album at `?album=:id`, and Esc closes it. With the inspector open, J/K moves to the next or previous album. Sections, top to bottom: *(FR-03.1–FR-03.4, FR-06.2–FR-06.4, FR-01.6, FR-01.8, FR-14.1)*

1. **Artwork** (240px) and title, artist credit, and edition chip.
2. **Chronology:** release type (Album / EP / Compilation / Unknown), a Live switch, original release year, and recording year or range (shown when Live is on). Hints explain which year sorts.
3. **Links:** one row per service, each with Open, Replace, and Remove (editing). A pending alternative link from capture (FR-06.4) shows as a notice: "Another Spotify link was found for this edition · Replace · Dismiss".
4. **Custom fields:** applied fields with editors (DS-26), then "+ Add field".
5. **Lists:** membership chips with × to remove and "+ Add to list" (`L`). With no memberships, an "Unsorted" chip.
6. **Info:** source service, edition release date, and date added to the collection.
7. **Footer (editing):** "Delete from collection…" in danger text.

**DS-47 Manual entry form.** A 560px dialog titled "New album" (desktop). Shortcut ⌘Enter saves; Esc asks before discarding entered data. *(FR-02.4, FR-02.6, FR-13.2)*

- **Field order:**
  1. Title*
  2. Artist credit*
  3. Release type + Live
  4. Original release year
  5. Recording year or range (when Live)
  6. Edition
  7. Artwork URL (with live preview)
  8. Spotify / Apple Music / Qobuz links
  9. Custom fields (+ Add field)
  10. Destination list
- **Year rule** in the helper text: "Required: original release year — or, for live releases, the recording year or release year."
- **Validation** runs on blur and on submit. Errors appear inline under each field and are summarized at the top for screen readers.
- **Destination list** is an optional combobox. It defaults to the current list when opened from one; otherwise it reads "No list (goes to Unsorted)".
- **Opened from a failed capture:** the form is pre-filled, and a banner explains why: "We couldn't read this link — complete the details below."

**DS-48 Link capture.** *(FR-02.1–FR-02.3, FR-02.5, FR-02.9–FR-02.11, FR-01.7, FR-06.4, FR-14.4, FR-15.3, X-04)*

- **Paste anywhere:** ⌘V with no text field focused, in a list, Unsorted, root, or folder view (desktop owner only).
  - In a list, links go to that list.
  - Elsewhere they are saved without a list. A toast offers "Add to list…" (`L`).
- **`C` or "+ Add album"** opens a capture popover. It has a multi-line input (one link per line), a destination combobox, and an "Enter manually" link that opens DS-47.
- **Inline progress:** each link becomes a placeholder row at its insertion point, showing skeleton artwork and "Resolving link…". The row becomes the real album on success.
  - **Failure:** the row turns into an inline error row with the reason and three actions: **Retry**, **Enter manually** (pre-filled), and **Dismiss**. The pasted link is preserved until dismissed.
- **Outcome toasts**, replacing the row where relevant:

  | Outcome | Toast |
  | --- | --- |
  | Confident match, added to this list | "Already in your collection — added to this list" |
  | Already in this list | "Already in this list" (the row flashes) |
  | Restored from Trash (FR-14.4) | "Restored from Trash and added" |
  | Different link already saved for that service (FR-06.4) | "Kept your existing Spotify link · Review" |

- **Uncertain match:** an inline decision card in the row asks "Is this the same edition?"
  - It shows the existing album (artwork, title, edition, year, services) and plain-language evidence: matching identifiers, track count, release date.
  - Actions: **Same edition — link it**, **Different edition — save separately**, **Decide later**. "Decide later" keeps the item pending in the batch report.
- **Batches** (more than one link) show a progress panel in the bottom-right, e.g. "Adding 12 · 8 done · 2 need you · 1 failed", which expands into the BatchOutcomeReport (DS-84).
- **Capacity refusals** appear inline with a link to the usage meter (DS-98).

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

**DS-50 Removal and deletion feedback.** *(FR-01.11, FR-01.8, FR-14.1, X-07)*

| Action | Feedback |
| --- | --- |
| Remove album from list (`⌫`) | Immediate, with undo toast "Removed from {list} · Undo" (8s) |
| Delete list (single or multi-select) | Immediate move to Trash, with undo toast "{n} lists moved to Trash · Undo". Undo runs Trash recovery. |
| Delete folder | Standard confirmation dialog: hierarchy counts and the first names, "albums stay in other lists or Unsorted", sharing effects |
| Delete album from collection (`⌘⌫`) | Standard confirmation dialog: "Removes it from every list and Unsorted; recoverable from Trash for 30 days" |

**DS-51 Unsorted placement** *(handoff FR-05.4)*:
- An album entering Unsorted, whether new or leaving its last list, is placed at the **top** of the owner's Unsorted manual order. Unsorted behaves like an inbox.
- Positions are not retained when an album leaves and later returns.
- New albums added to a **list** go at the **end** of the adding owner's manual order, which suits lists used as rankings.
- Viewers' arrangements place newly added albums at the end.

---

## 6. Trash

**DS-55 Trash view** (desktop only). A table of **units**, each row showing:
- type icon and name;
- what the unit contains (e.g. "Folder · 6 lists, 2 folders" or "Album");
- deletion date;
- expiry: relative ("Expires in 12 days"), with the exact date on hover or focus; under 3 days the text turns `status.warning`;
- former location.

Folder units expand to show their contents read-only. Contents are labelled "Part of '{folder}' — restore or delete the folder to act on these" and have no actions of their own. A local name filter narrows the table; this is not global search. Actions per unit: **Restore** (`R`) and **Delete permanently…**. The header has **Empty Trash…**. *(FR-01.12, FR-01.13, FR-01.17, FR-12.1)*

**DS-56 Recovery prompts.** All prompts preview the effective sharing through SharingImpact (FR-07.14). *(FR-01.14–FR-01.16, FR-14.2, FR-14.3, FR-07.10)*

- **Destination** (original parent unavailable): a dialog explains "'{parent}' is in Trash or no longer exists. Choose where to restore '{item}'." It offers a tree picker of active folders and the root, then **Restore** or **Cancel**.
- **Name collision:** a dialog explains "'{destination}' already has a list or folder named '{name}'." It offers a name input pre-filled with the current name, selected for editing; Tonaris never auto-renames. A "Choose another location…" link opens the picker. Then **Restore** or **Cancel**.
- **Skipped memberships** (container or album restore): a toast reads "Restored · 2 memberships skipped". A **Details** button opens a report listing each skipped album or list with its reason.
- **Same-edition conflict** (album restore): a dialog shows both records side by side with the explanation from FR-14.3, and three actions:
  - **Keep the active album** (cancels the restore);
  - **Delete the active album, then restore…**, which leads to the standard confirmation dialog;
  - **Cancel**.

**DS-57 Permanent removal.** Both use the standard confirmation dialog (DS-28) with "This can't be undone", and the button names the count, e.g. "Permanently delete 34 items". *(FR-01.18, FR-14.5)*
- **Delete permanently:** for an album unit, the dialog shows the slot that will be freed.
- **Empty Trash:** totals by type.

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

**DS-66 Invitations inbox.** `/invitations` lists pending invitations: the owner's display name, collection name and type, and date, each with **Accept** and **Decline**.
- **From email:** the email link lands on `/invitations/:id`, which requires sign-in as the recipient.
- **Wrong account:** "This invitation is for a different account — sign out and sign in with that email".
- **Invalid invitation:** "This invitation is no longer available".

*(FR-07.5, FR-07.6)*

**DS-67 Shared with me.** The sidebar section and `/shared` index group references by owner display name.
- **Context menu:** **Leave share…** for invitation-based references, with a small confirmation explaining that the owner must re-invite you; **Remove from Shared with me** for link references.
- **Inaccessible references:** shown dimmed with "No longer available" and **Remove**.

*(FR-07.7, FR-07.13)*

**DS-68 Signed-in visit to a shared link.** A banner reads "Shared by {name} · **Add to Shared with me**". It changes to "In Shared with me" after adding. Adding never happens implicitly. *(FR-07.13)*

**DS-69 SharingImpact.** A compact block, used in move pickers, move confirmations, recovery dialogs, and the standard confirmation dialog. Each line names people by display name or email as the owner entered it, and link audiences by their source. *(FR-07.9, FR-07.10, FR-07.14)*

| Line | Shown when |
| --- | --- |
| **Newly visible to** … | the operation adds an audience |
| **No longer visible through** … | an audience is removed |
| **Still shared directly with** … | direct shares are preserved |
| "Sharing unchanged" | nothing changes |

The block never says "private" while another access path remains.

**DS-70 Viewer chrome (signed-in).** Same shell. The header shows a "View only · Shared by {name}" pill, has no mode toggle or edit affordances, and offers view options. Desktop viewers can rearrange (DS-49) in their own arrangement. *(FR-05.2, FR-07.17)*

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

**DS-81 Sync indicator and Activity.** The SyncIndicator sits in the sidebar footer, in the mobile account menu, and as a small dot on guest pages. Clicking it opens **Activity**: a popover listing pending, failed, conflict, and unconfirmed items, plus open batch reports. *(FR-09.3, section 2.3)*

| Connection state | Indicator |
| --- | --- |
| *connected* | Neutral dot, no label; tooltip "Up to date". With saves in flight: "Saving…" |
| *reconnecting* | Warning dot, "Reconnecting…". Edits are still accepted as *pending*. |
| *offline* | Danger dot, "Offline — changes can't be saved". A slim banner in the main view reads "Offline — showing what was last loaded". Edit controls are disabled with the tooltip "You're offline". |

The tech spec defines the timing that separates *reconnecting* from *offline*.

**DS-82 Live updates from elsewhere.** *(FR-09.1, FR-07.11)*
- Rows changed by another session, agent, or owner get a 1.2s `accent.soft` background fade.
- New rows appear without motion when off-screen.
- Scroll stays anchored, and focus or selection stays on the same item even if it moves.
- **Concurrent edit in an open field:** an open editor is never overwritten. FR-09.4 applies on commit.
- **Item removed elsewhere:** an open inspector shows "This album was moved to Trash" (or "is no longer shared with you") with Close.

**DS-83 Announcements.** A polite `aria-live` region announces mode switches, moves and reorders, batch completion summaries, and restores. An assertive region announces failures, conflicts, and going offline. Routine confirmed saves are not announced. Pending items set `aria-busy` on their row. *(Q-02)*

**DS-84 BatchOutcomeReport.** Results are grouped in this order: **Needs you** (uncertain matches, destination or name choices, approvals) · **Failed** · **Skipped** · **Unconfirmed** · **Pending** · **Completed**.
- Each item has its reason and its next action: Retry, Edit, Decide, or Enter manually.
- Inputs are kept until the item is resolved or dismissed.
- The report stays in Activity until dismissed.
- Its header line is the summary sentence, e.g. "9 added · 2 need you · 1 failed".

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
- **Uncertain-match variant:** the DS-48 decision card, with **Same edition** / **Different edition** / **Decline**.
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

Invalid, revoked, expired, already-used, or paused invitations each get one plain sentence explaining the status, and nothing else.

**DS-92 Settings layout.**
- **Subnav:** Profile · Account · Preferences · Custom fields · Connections · Data.
- **Admin:** appears only for the creator.
- **Danger zone:** at the bottom of Account.

*(FR-11.13)*

**DS-93 Profile and account.** *(FR-11.3, FR-11.4, FR-11.5)*
- **Display name:** saved on blur. While sharing is on, clearing it shows an inline error that keeps the current value.
- **Change sign-in email:** a stepper with three steps:
  1. Enter the new address.
  2. Enter the code sent to the **current** address.
  3. Enter the code sent to the **new** address.

  Then "Done — use {new} to sign in". Cancelling at any step changes nothing.
- **Lost access to your email?** is a link from sign-in and Account to `/help/recovery`. That page explains creator-assisted recovery and shows the support contact address (TS-73). There is no in-app request form.

**DS-94 Preferences.** Default sort and direction for lists, default sort for folders, default grouping, and default layout. A note explains that remembered per-view choices are kept when defaults change. *(FR-11.7)*

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

**DS-98 Usage meter.** Settings → Data shows "4,812 of 5,000 albums · 37 in Trash", with a bar split into active and trashed. *(FR-15.2, FR-15.3)*
- At 95% or more, a quiet notice appears in capture surfaces.
- At the limit, capture shows "You've reached 5,000 albums (including Trash). Permanently delete albums from Trash or remove albums to add more", with links.

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

---

## 15. States, copy, and mobile

**DS-105 Empty states.** One sentence and one action. *(FR-01.9, FR-12)*

| View | Copy | Action |
| --- | --- | --- |
| Root (first run) | "Start your collection — paste an album link or create a list." | New list |
| List | "No albums yet. Paste a Spotify, Apple Music or Qobuz link." | Add album |
| Unsorted | "Albums that aren't in any list show up here." | — |
| Shared with me | "Collections people share with you appear here." | — |
| Trash | "Nothing in Trash. Deleted items stay here for 30 days." | — |
| Search | "No folders, lists, artists or albums match "{q}"." | — |

The root's first-run state also offers a secondary action, "Connect an AI assistant", which links to Settings → Connections.

**DS-106 Loading.** *(Q-01)*
- **First load:** a shell skeleton (sidebar, header, rows) until the collection snapshot is ready.
- **After that:** no spinners or skeletons for navigation within loaded data.
- **Guest pages** are server-rendered with content.
- **Artwork** shows the fallback tile, then fades in (DS-23).
- **Lists of 100 rows or more** are virtualized, with a fixed row height and overscan for smooth scrolling.

**DS-107 Copy tone.** Plain, specific, blameless, and action-first. Sentence case, no exclamation marks. Name the thing and offer one way forward. Use "Couldn't…", not "Error:"; never use "Oops". *(FR-13.1)*

| Situation | Copy |
| --- | --- |
| Unsupported link | "This doesn't look like a Spotify, Apple Music or Qobuz album or track link." · Enter manually |
| Lookup failed | "Couldn't reach Apple Music. Your link is saved here — try again or enter details manually." |
| Not permitted | "You can view this shared list but not change it." |
| Name taken | "'Favorites' already exists in Metal. Choose another name." |
| Service can't open | "Couldn't open Qobuz or its website for this album." |

**DS-108 Toasts.**
- Shown bottom-right, at most 3 visible.
- Durations: info 4s, undo 8s. Failures, conflicts, and anything needing a decision persist until dismissed.
- Toasts pause on hover or focus, and are reachable with F6 and from Activity.

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
