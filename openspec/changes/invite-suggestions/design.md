# Design

## Context

`share_grants` already records every invitation: its folder or list (and so its owner), the person, the address typed, and a status that ends as declined, withdrawn or revoked. The dialog's invite field (`share-dialog.tsx`) is a plain email input. "Add to a list" (TON-177) finds lists by typing with a combobox and the domain's Latin-spelling matching.

## Decisions

- **People are worked out, not stored** (FR-07.23, the creator's choices on 18 November 2026). For a person U:
  - everyone with a grant on U's folders or lists, whatever its status but `declined`;
  - every owner of a folder or list U has a grant on with `accepted_at` set: accepted now, or before leaving or a revocation.
  - Never U, an account being deleted (`deleting_at`), or someone with neither a display name nor an address U typed, who couldn't be told apart.
- **`share_grants.accepted_at`** is set by `share.accept`, so a revoked grant still says whether it was accepted. The migration backfills it from `updated_at` for accepted and withdrawn grants. Grants revoked before it don't know, so they connect the owner to the person but not back.
- **`share_grants.invited_email` becomes nullable.** An invitation by account keeps the address the owner last typed for that person, else none. The dialog, its role labels and DS-69's previews name such a person by display name, else "a Tonaris member".
- **`GET /v1/people`** gives each person: id, display name, the address the caller last typed for them (null when none: their email is never sent), when they last shared either way (the newest such grant's `created_at`), and `sharesWithYou`, the name of the newest accepted invitation from them that the caller can open now, else null. Latest first. It reads; sharing changes stay app-only (X-03), and MCP gets nothing.
- **`share.invite` takes `personId` in place of `email`,** exactly one of them. The store's `findPerson(owner, id)` applies the same rules as the read; anything else answers `recipient_not_found`, as an address with no account does, so an id can't be probed. Self is not one's own person.
- **The field** (`invite-field.tsx`): "Invite by name or email…", a combobox whose listbox opens under it while it has the focus. Before typing it lists up to 8, nothing active, so Enter with nothing chosen does nothing; typing makes the first match active, and Enter or a click invites that person at once with the role beside the field. Typing an address nobody matches and pressing Enter or Invite invites by email as before. Escape closes the list first, then the dialog. People with an open invitation here are left out, by `personId` in the dialog's settings.
- **Matching** (`people-picker.ts`, pure): each typed word must match the name or the address, as "Find a list" matches path words (FR-12.5); names matching the whole text come first, then latest first; at most 50.
- **Same name:** when two offered people show the same name, each with a `sharesWithYou` names it after the name.

## Risks

- A grant goes when its folder or list is purged from Trash, and with it a connection that had only that grant.
- A person with the same name and no share you can open still looks the same as another; TON-296's avatar color will help.
