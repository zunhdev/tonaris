# Design

## Context

- The dialog read the whole tree on the device and rendered one button per list the album isn't in, sorted by path.
- The palette (DS-75, DS-115) is a combobox over a listbox, with `aria-activedescendant`, and matches with `searchKey` and `searchTier` from `@tonaris/domain`.
- Each list's entries, with their `addedAt`, are in `useCollectionData().entriesByList`.

## Decisions

### 1. Recent from the entries, not from this device

The suggestions come from the latest `addedAt` of each list's entries, so they are the same on every device and need no new store. The palette's Recent is per device because it tracks what was opened, which nothing else records. `addedAt` values are compared bytewise, as `entryOrder` does. If fewer than 8 lists have entries, others fill the rest by path, so a new account still sees its lists.

### 2. Matching words against the path

Every typed word must be a substring of the path's search key ("Folder › Folder › List"), so a folder's name narrows the lists. Ranking follows search's tiers on the list's own name, for the whole text, with path-only matches after them; within a tier, path order. The palette matches one substring of a name, which would miss "2000 земф".

### 3. 50 at most, without virtualization

Typed results stop at 50, with the total, so the dialog never renders thousands of rows and needs no virtualizer. The suggestions are 8.

### 4. A keyed inner component

The picker is keyed by the album, so each opening starts with an empty field and the first option active, without resetting state in an effect.

## Risks / Trade-offs

- [The choices are rebuilt on each opening, one path per list] → thousands of `searchKey` calls, a few milliseconds; matching after that is a substring scan per keystroke.
- [A list added to while the dialog is open moves into Recent] → only from another device or client; the dialog is open briefly.
