# Proposal

## Why

In the creator's manual testing, the sidebar footer's sync indicator read as broken: with everything saved it is a full-width button holding only a dot, and with Activity open a blank highlighted bar. It also gave no sign of the 3 reports waiting in Activity. The creator picked variant 3 with R on the comparison page. Linear: TON-291.

## What Changes

- The indicator is a row like Search and Add album: the History icon and "Activity" (DS-81).
- Its state shows at the right only when there is one: "Saving…" with a spinner, "{n} waiting", or "{n} need review" in warning text.
- Up to date, the right shows how many reports are open in Activity, styled like the tree's counts.
- Reconnecting or offline takes over the row, with a cloud icon in the state's color.
- Its accessible name starts with "Activity", its visible label; a tooltip gives the state when the row shortens it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-and-conflicts`: the indicator is named Activity and shows its state at the right.
