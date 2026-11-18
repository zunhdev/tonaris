# Design

## Context

The avatar (TON-169) is the name's first letter on `oklch(0.52 0.12 h)`, `h` from a hash of the name; lightness 0.52 keeps the white letter at 4.5:1 at every hue. Display names change through `account.setDisplayName` in Settings → Profile. Owners are named by display name in shared snapshots, Shared with me, invitations and the dialog's rows; TON-294 and TON-295 added people with avatars.

## Decisions

- **Two columns on `user`:** `avatar_hue` (null for Automatic, else 0, 30, … 330, checked) and `about` (null for none). Commands `account.setAvatarColor {avatarHue}` and `account.setAbout {about}`, app-only through `actingOwner`'s account scope. About is trimmed, line breaks and runs of spaces become one space, blank clears it, and 160 code points is the limit (`maxAboutLength`, TS-18). The creator's choices on 18 November 2026.
- **`avatarHue` travels with every name** as a response addition: `GET /v1/me`, the dialog's invitations, people, Shared with me's and invitations' owners, and the shared snapshot's owner, guests' included. `Avatar` takes it and falls back to the name's hash.
- **About only through `GET /v1/people/{id}`,** as `about`, when the caller is one of that person's people from the person's side (`connections(person, caller)`), so an unanswered invitation, a decline or Remove from People hides it. Nothing else carries it: not the snapshot, guests, exports or MCP.
- **The Shared by card:** the pill becomes a button opening a popover with the owner's avatar and name; it reads `GET /v1/people/{ownerId}` (the owner's id from Shared with me's entry) and adds the About and "See {name} in People" when it answers. The person's page shows the About under the name.
- **Notices** gain an optional leading element in the UI's `notice`, for the owner's avatar.
- **Settings → Profile:** a radio group of 13 round swatches, Automatic first, each named (Rose, Red, Orange, Ochre, Olive, Green, Teal, Cyan, Sky, Blue, Violet, Magenta), saving on choice; the About field under the display name, saving like it, with a count.
- **The notice's text changes**, so `termsVersion` becomes `2026-11-18` (TS-134).

## Risks

- Every member is asked to agree again once.
- A person can be told apart from a namesake only by color when neither has an address the viewer typed.
