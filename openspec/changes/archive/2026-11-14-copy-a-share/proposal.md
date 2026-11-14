# Proposal

## Why

In manual testing on 31 October 2026, the creator wanted to copy a folder or list someone shared, with its folders, lists and albums, and make it their own. There was no way to: a share could only be viewed or edited in place. The design questions were answered on 14 November 2026 (FR-07.22, AC-51). Linear: TON-133.

## What Changes

- **`share.copy`** copies a folder or list the person can open, by invitation or a saved link, into their collection, under a folder of theirs or at the top level. The copy is a snapshot that is simply theirs; nothing records where it came from, and the share stays in Shared with me.
- **What goes:** names, descriptions and colors; albums with their details, service links and artwork; the lists' albums; and the person's own manual order and view choices of the share's views.
- **Albums they have** (by MusicBrainz release group, else service link) join the copied lists and keep their own details; albums with neither are copied as new.
- **Custom fields** map onto theirs by name and type; missing ones are created with the options the copied albums use; one of the same name but another type isn't copied.
- **All or nothing:** `GET /v1/shared/{id}/copy` previews what it adds and any limit it would exceed; `share.copy` refuses the same, and a taken name.
- **The app:** "Copy to my collection…" in a share's header opens a dialog: a place, the name, what it adds, and Copy.
- **MCP:** `copy_shared` copies after the person's approval (`copy_share`), saying what it adds.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: a share can be copied into one's own collection.
- `mcp-access`: agents copy a share after approval.
