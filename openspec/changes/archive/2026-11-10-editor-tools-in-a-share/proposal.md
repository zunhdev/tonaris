# Proposal

## Why

TON-191 made a share editable in the app. Its shortcuts, Move to, deletions and previews still behaved as in the person's own collection: N and F2 opened editors in the sidebar, which shows the person's own collection; Move to offered the top level; deletions spoke of "your Trash"; and previews answered nothing for an editor. Linear: TON-195. It implements FR-07.19–FR-07.21 in these tools, with X-07's confirmations and DS-50 and DS-69 for editors.

## What Changes

- **Shortcuts and the palette's commands** act on the share on screen. N, ⇧N and F2 open the name dialog, now held by a provider the shell reaches.
- **Move to** lists only the share's folders. On the shared folder or list itself, it says only its owner can move it, and offers nowhere.
- **Deleting:** ⌫ on the shared folder or list itself deletes nothing and says why. A list's Undo names the owner's Trash, and a folder's confirmation says only the owner can restore it. An album's confirmation names the share's lists it leaves, and says the owner's other lists keep it.
- **Previews:** `GET /v1/sharing/impact` answers an editor's move inside a share with the audiences withheld (`withheld`, additive), shown as "Sharing unchanged" or "Who can see it changes".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: an editor's tools keep to the share, and its deletions and previews say what they do without revealing the owner's other content or audiences.

## Impact

- **Web:** `use-shortcuts` through `useStartEditor` and `NamingProvider`, `move.tsx`, `delete-containers.tsx`, `sharing-impact.tsx`.
- **API, db and domain:** `editorsMoveImpact`, the impact route's fallback, and `sharingImpactSchema.withheld`.
- **Docs:** DS-50, DS-69 and DS-70, as built.
