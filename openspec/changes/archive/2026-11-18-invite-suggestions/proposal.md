# Proposal

## Why

The creator shares with the same few people again and again, and the sharing dialog's "Invite by email…" field needs the whole address every time. Linear: TON-294, the first step of People and profiles (P-TON-57). Rules: FR-07.4, the new FR-07.23, DS-65, TS-33.

## What Changes

- **Your people** (FR-07.23): everyone you invited, unless they only ever declined, and everyone who invited you, once you accepted. Leaving or revoking a share keeps the connection. Nobody else can be found.
- **The invite field suggests them:** before typing, the 8 most recently shared with, either direction; typing finds the rest by name or by the address you typed. People with an open invitation to this folder or list aren't offered. Two with the same name each name one of their shares with you.
- **Choosing one invites their account.** Someone who invited you shows by name only and keeps their email hidden (FR-07.3); their invitation has no typed address. An id that isn't one of your people is refused as an unregistered address is.
- `GET /v1/people` lists them; `share.invite` takes `personId` in place of `email`. Invitations record when they're accepted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: the owner's people, suggested in the invite field and invited by account.
