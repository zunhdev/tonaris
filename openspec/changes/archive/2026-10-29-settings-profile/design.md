# Design

## Context

- **`account.setDisplayName`** (TON-65) trims the name, and treats a blank one as clearing it. It refuses `display_name_required` while the account shares anything. The web app sends it with `sendNow`, outside the outbox, as the sharing dialog does.
- **The account** (`GET /v1/me`) is loaded once per page by `currentAccount()` and handed to the workspace through `_workspace`'s `beforeLoad`. The account menu reads it from there.
- **Settings pages** share `SettingsNav`.

## Goals / Non-Goals

**Goals:** the Profile page and the subnav entry, plus verifying AC-38's settings part and AC-16's defaults part.

**Non-Goals:**
- the Account page and its parts (TON-77–TON-79);
- moving the account menu's Settings item or G then S away from Preferences. The app-shell spec names Preferences, and changing that isn't this issue's.

## Decisions

### 1. Save on blur, through the existing command

The field starts with the saved name.
- **On blur, or on Enter** (a form submit), a changed value is sent as `account.setDisplayName`. An unchanged one sends nothing.
- **On success,** a polite "Saved." appears. `forgetAccount()` and `router.invalidate()` then reload the account, so the account menu changes at once.
- **On a refusal,** the field goes back to the saved name, and the server's sentence shows under it as an alert. The same happens when Tonaris can't be reached, with "Couldn't reach Tonaris. Try again."

**Alternative considered:** a Save button. DS-93 says the name is saved on blur.

### 2. The first subnav entry

`SettingsNav` lists Profile first, as DS-92 orders the pages.

## Risks / Trade-offs

- **[The name changes in another session]:** the account is loaded per page, so another tab shows the new name after its next load. Shared pages already show the owner's name live (TS-34).

## Migration Plan

None.
