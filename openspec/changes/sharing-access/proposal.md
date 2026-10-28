# Proposal

Linear: TON-64 (Feature). Implements FR-07.8, FR-07.9, FR-07.10 and FR-07.12, and X-01 for reads through sharing. Tech: TS-30 to TS-33. Done when property tests for inheritance across moves, Trash and revocation pass, and the domain behavior for AC-20 and AC-30 is covered.

## Why

Sharing's tables have existed since TON-5, but nothing reads them. Every later M7 issue needs one answer to "may this viewer read this container, and what do they see?": the dialog, invitations, Shared with me, viewer chrome, guest pages and shared search.

## What Changes

- **Link tokens** (TS-32): 32 random bytes, base64url-encoded. Only their SHA-256 is stored, and a token is looked up by its hash. A revoked link never resolves.
- **Viewers:** a principal reads through sharing as a person (a signed-in user, or an MCP connection acting for them) or as a link guest.
- **Access resolution** (TS-31). A viewer may read a container when some ancestor-or-self is a source and every node from that source down to it is active. The sources:
  - a person's accepted grants, and the active links of their saved references;
  - a guest's link, if active.

  Pending, declined, withdrawn and revoked grants grant nothing.
- **Inheritance follows the hierarchy:**
  - a folder share covers current and future descendants (FR-07.8);
  - moving content in or out of a shared folder gains or loses that audience, and direct shares stay (FR-07.9).
- **Trash suspends sharing:** trashed content can't be read through any path. Grants and links are untouched, so recovery resumes them; pending stays pending, and revoked stays revoked (FR-07.10).
- **The shared snapshot** of a readable container (FR-07.11, FR-07.12):
  - its active subtree, with descriptions;
  - the active albums with effective entries in it, and their service links;
  - only the custom fields those albums use, with only the options their values choose;
  - the owner's display name, never their email.

  The root's parent, a private folder, is not revealed.
- **One pure model in `packages/domain`** defines access. The database's recursive CTEs are tested against it with property tests.

No API, commands or interface yet: the sharing dialog (TON-65), invitations (TON-66) and the viewer and guest routes (TON-68 to TON-70) build on this.

## Capabilities

### New Capabilities

- `sharing`: who may read shared folders and lists and what they see, by invitation grants and links, through the hierarchy and Trash.

### Modified Capabilities

None.

## Impact

- **`packages/domain`:** `sharing.ts`, with the statuses, tokens, viewers, the access model and the snapshot schema. `shareGrantStatuses` and `emailStatuses` move here from the db schema, with the same values.
- **`packages/db`:** `sharing.ts`, with link lookup, readable containers, the read check and the snapshot. `sync.ts` exports the column helpers it reuses.
- **No schema change:** `share_links`, `share_grants` and `saved_references` exist since TON-5.
