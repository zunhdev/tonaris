# Design

## Context

- **TON-64** resolves access from `share_grants` and `share_links`, and finds links by SHA-256. Its token was random, so the owner could never see a link again.
- **Writes are domain commands through `/v1/mutations`,** idempotent by `mutationId` (TS-22), on the owner's write lock. Context the API prepares before the lock reaches commands through `CommandContext`: `capture`, and `link` for `link.set`'s URL.
- **Better Auth exposes no `update-user`.** The display name has no writer yet.
- **The workspace's dialogs** (Move, Add to list) are started through `CollectionUi` and rendered by the shell.

## Goals / Non-Goals

**Goals:** DS-65's dialog, the commands it needs, derived links, and the display-name guard.

**Non-Goals:**
- invitation email, the inbox, accepting and declining (TON-66);
- revoking an invitation, leaving, and reference behavior after a link changes (TON-67);
- viewers' and guests' pages (TON-68 to TON-70);
- the Settings page (M8).

## Decisions

### 1. Derived link tokens

- **The token:** `shareToken(secret, linkId)` is base64url(HMAC-SHA256(secret, `tonaris:share-link:` + linkId)), 43 characters.
- **The stored hash:** `share_links.token_hash` is SHA-256(token), as TON-64 looks up.
- **Creating a link:** the API computes the hash before the write lock and passes it in `CommandContext.shareLink`, as `link.set` does with its URL. The command stores it.
- **Showing it:** `GET …/sharing` derives the token again for the owner.
- **Rotation:** rotating `BETTER_AUTH_SECRET` breaks every link. That's recorded in TS-32 and `docs/deploy.md`.
- **Alternatives:**
  - show-once random tokens (rejected by the creator);
  - storing the token encrypted: no gain, and an extra column.

### 2. Commands

**`share.invite`:**
1. Authorize as a `sharing` write: the owner only, never MCP.
2. Require the container to be active.
3. Require the owner's display name.
4. Look the recipient up by `emailKey`. None: `recipient_not_found`.
5. Refuse yourself: `validation_failed`.
6. An open grant for the pair answers that grant. Otherwise insert `pending`, with `invited_email` as typed.
7. Report `{grantId, status}`. No change is logged: the owner's client doesn't hold grants.

**`share.setLink`:**
- **On:** keep the live link, or insert one with `linkId` and the prepared hash. Report `{linkId}`.
- **Off:** set `revoked_at`.
- **Guard:** turning on needs a display name; turning off never does.

**`account.setDisplayName`:**
- trims;
- refuses a blank name while `activeShareCount(owner) > 0`, which counts pending or accepted grants and live links on any of the owner's containers;
- stores null for blank.

Its scope is `account`, so MCP gets `app_only`.

**The store** gains:
- `findAccountByEmail`, `displayNameOf`, `setDisplayName`, `activeShareCount`;
- `findOpenGrant`, `insertGrant`;
- `findLiveLink`, `insertLink`, `revokeLink`.

`memoryStore` mirrors them.

### 3. The read

**`shareSettings(db, ownerId, containerId)`** in `packages/db/src/sharing.ts` answers `undefined` unless the owner owns the container. Otherwise:
- **Invitations:** open grants with the invited address and the grantee's display name, newest last.
- **The link:** the live link's ID; the API turns it into a URL with the derived token.
- **Inherited access:** for each ancestor, the count of its open grants and whether it has a live link. Ancestors with neither are left out.
- **The owner's display name.**

### 4. Errors

- **`recipient_not_found`** (422): "No Tonaris account uses this email. Invitations only work for existing members — you can share a link instead."
- **`display_name_required`** (409): "Add a display name before sharing.", or "People you share with see your display name. Stop sharing to clear it."
- Both are additive response enum values: oasdiff warns, and doesn't fail.

### 5. The dialog

- **Where:** `features/sharing/share-dialog.tsx`, started by `ui.startShare(id)` and rendered in the shell.
- **Data:** it loads `GET …/sharing` when opened, and again after each command. The response's schema is `shareSettingsSchema`; `SharingState` already names TON-64's access model.
- **Commands** go through `POST /v1/mutations` directly with a fresh `mutationId`, retried with the same one on a network error. Sharing is online-only, so there's no outbox and no optimism. Offline, the dialog says so and disables its controls.
- **Turning the link off** asks first, inline (DS-65).
- **Copy** uses the Clipboard API and says "Copied".

### 6. Entry points

- **The header:** a Share button on folder and list views, the owner's, on desktop.
- **⇧S:** a new matcher single (`S`), the action `share`.
- **The palette:** the command "Share…", which takes the focused or viewed folder or list. Blocked offline or without one.

## Risks / Trade-offs

- **[Secret rotation breaks links]** → Documented; rotation is already a sign-everyone-out emergency.
- **[Grants are invisible to the owner's other sessions until the dialog reloads]** → The dialog loads on open. Live grant updates come with invalidation in TON-70.

## Migration Plan

- Add `share_grants.invited_email text NOT NULL`. The table has no rows yet: nothing shared before this change.
