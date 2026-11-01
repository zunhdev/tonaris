# Design

## Context

On a phone (below 768 px) each view's top bar is `PageHeader`'s narrow form: Back, the name, the view's controls, Search and Account (DS-110). Each caller passes `back`, the view above. Collection views already work out their ancestors for the desktop's breadcrumbs (`ancestorsOf`), and a shared view works out the folder above in its share.

## Decisions

### 1. `path` replaces `back`

`PageHeader` takes `path`: the views above, from the top down, each `{ to, label }`. Back goes to its last entry, so a caller states the path once and Back can't disagree with the menu. Views one level down pass `[Collection]`.

### 2. The name as the menu's trigger

With two or more entries in `path`, the `h1` holds a button: the name, then a small chevron, opening a `DropdownMenu` labelled "Path" whose items are the entries in order. The `h1` keeps naming the main landmark (DS-29), since the chevron is hidden from assistive technology; the button announces itself as a menu button. Items navigate with `router.history.push`, as Back does, since a shared view's addresses carry search parameters. The menu is at most the screen's width less the gutters, and long names truncate.

### 3. A touch size for phone menus

`DropdownMenuContent` gains `size="touch"`: 44 px items, DS-110's touch target, the way `SegmentedControl` has a `touch` size (TON-134). The account menu's phone form (TON-152) switches to it from its own class.
