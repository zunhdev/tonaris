# Design

## Context

`SyncIndicator` (`apps/web/src/features/sync/sync-indicator.tsx`) is a full-width ghost button with a status dot and, when something is happening, a label. DS-81 gives the order the label follows: offline, reconnecting, waiting to confirm, needing review, saving.

## Decisions

- **The row.** The History icon and "Activity", as Search and Add album are drawn. The label's order stays; what it shows moves to the right as a short form: "Saving…" with the pending spinner, "{n} waiting", "{n} need review" in `status.warning`. Reconnecting and offline replace the whole row, so they can't be missed: CloudSync in warning, CloudOff in danger, with today's words, wrapping.
- **Open reports.** With nothing else to say, the right shows the number of reports Activity lists, in the tree's count style. A count only, since the words would crowd a 200 px sidebar.
- **Accessible name.** "Activity: {state}", where the state is today's full label or "Up to date", plus ", {n} reports" when counted. It starts with the visible label, as WCAG 2.5.3 asks; "Sync status:" did not contain "Activity".
- **Tooltip.** Shown when the row doesn't show the full state (up to date, waiting, open reports, connecting). The trigger keeps one tooltip and disables it otherwise, so a change of state doesn't remount the button under the person's focus.

## Risks

- Browser tests find the indicator by its name; they move from `/^Sync status:/` to `/^Activity:/`.
