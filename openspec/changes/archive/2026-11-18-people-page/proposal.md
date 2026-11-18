# Proposal

## Why

Seeing what Anna can open or edit means opening the sharing dialog of every folder and list. The creator wants a list of the people they share with, and what's shared each way. Linear: TON-295, the second step of People and profiles (P-TON-57). Rules: the new FR-07.24, FR-07.15, FR-07.23, DS-31, the new DS-121.

## What Changes

- **People** in the sidebar, after Shared with me, and on a phone's Shared screen, opens `/people`: a row per person, latest first, with their avatar, name, the address you typed, "You share 3 lists and 1 folder (1 to edit)" and "Shares 2 lists with you", and a field to find people by typing.
- **A person's page**, `/people/{id}`, lists each folder and list you share with them and they share with you, with its role and Pending or Accepted. Yours open their sharing dialog; theirs open the shared view, or the invitation while it's pending.
- **Stop sharing with {name}…** revokes every invitation of yours to them, after the standard confirmation listing what they lose (`share.revokePerson`). Their shares with you stay.
- **Remove from People** hides someone from the page and the invite suggestions, revoking nothing, until a new invitation connects you again (`people.remove`).
- On a phone the pages read only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: the People page, a person's page, stopping sharing with a person, and removing someone from People.
