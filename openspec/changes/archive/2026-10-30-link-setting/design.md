# Design

## Context

- **`appLink()`** (`features/open/app-links.ts`, TON-47) already turns a canonical URL into its app's scheme.
- **The account defaults** live in `account_settings`. They reach every session through the bootstrap and the stream's `defaults` change, and `defaults.set` changes them (TON-35).
- **CI's oasdiff** reads any change to an existing mutation's request as a removal. A new mutation, a new response property and a new stream variant pass.

## Goals / Non-Goals

**Goals:** one account setting, synced like the defaults, that every signed-in link follows.

**Non-Goals:**
- a per-device setting (the creator chose the account);
- detecting whether an app is installed, which browsers don't allow;
- a preferred service (FR-06.5).

## Decisions

### 1. The setting rides on the account defaults

- **Storage:** `linkTarget` is a column of `account_settings`, `not null default 'web'`.
  - A person who sets it before saving any defaults gets a row with DS-44's defaults, which is what they had.
  - The export keeps `defaultsColumns` without it. It's about opening links on a device, not the collection.
- **To the client:** the bootstrap's `defaults` and the stream's `defaults` change carry `accountDefaultsSchema`, which is the defaults plus `linkTarget`. The web client keeps one defaults row.
- **Alternative:** a new entity and collection. Rejected: it would add a second row to fetch, sync and resubmit, for one value.

### 2. A new mutation for the setting

`defaults.setLinkTarget { linkTarget } / base { linkTarget }`, with the same compare-and-set as `defaults.set` (TS-21).
- **Why not a new field on `defaults.set`:** that would change its request, which oasdiff fails (TS-09).
- **On the client:** `defaultsWrites()` turns one update of the defaults row into a `defaults.set` for view options and a `defaults.setLinkTarget` for the setting.
- **Resubmit, dependencies and the conflict review** handle it like `defaults.set`. The review reads it as "Open links in": Web page or App.

### 3. One anchor for every link

`ServiceAnchor` reads the setting from the collection data and renders a link to the canonical page (`target="_blank"`, `rel="noopener noreferrer"`) or to `appLink()`.
- **Where it renders:** in `ServiceChoices`, which is the chooser's popover and the shared pages' Open popover, in the phone sheet, and in the inspector's Links.
- **Outside the workspace,** the collection data's empty value says `web`, so guests get the pages.
- **A URL `appLink()` can't read** opens its page.

## Risks / Trade-offs

- **[Risk] With App set, a link to an app that isn't installed does nothing visible** (Chrome) or shows an error (Safari). → The note under the setting says so, and switching back is one click.
- **[Risk] Phones with App set get custom schemes** instead of universal links. → The creator chose the account scope knowing this. The setting says it applies on every device.
- **[Trade-off] The stream's `defaults` variant changes shape.** To oasdiff, that is a response `oneOf` member removed and one added. The repo reports an added member as a warning, and a removed one in a response doesn't break clients. CI's oasdiff confirms it on the PR.
