# Design

## Context

On a phone (below 768 px) the workspace drills down from the Collection screen, `RootView`, which listed the root's folders and lists with Unsorted and Shared with me pinned below (DS-110). Shared with me opened the desktop's page, grouped by owner. The workspace already reads Shared with me once (`SharedEntriesProvider`, TON-130) and polls pending invitations (TON-66).

## Decisions

### 1. A switch, not a tab bar

A segmented "Mine | Shared" control sits under the top bar, full width. The creator chose it over a bottom tab bar, which would change phone navigation throughout, and over one list with a shared section, which a long collection would bury. It is `SegmentedControl` with a new `touch` size: 40 px options in the base size, inside the control's border and padding, so each is a 44 px target (DS-110).

### 2. What Shared shows

The workspace's Shared with me entries, ordered as the sidebar's (`buildSharedTree`: by name, those that can't be opened last), one 48 px row each with the owner after the name. Pending invitations come first as one row to the inbox, since a phone has no sidebar to show them. An empty Shared says what will appear there. View options don't apply to it, so the top bar leaves them out.

### 3. Where the choice lives

`?show=shared` makes Shared addressable, so the shared view's Back (from its top) returns to `/c?show=shared`. Without it, the side last chosen on the device applies (`phoneRootTab`, per account in localStorage), kept in React state as well, since switching from a remembered Shared to Mine leaves the address unchanged.
