# Design

## Context

TON-294 worked out a person's people from `share_grants` (`personThrough`, `connections`) and gave `GET /v1/people`. `GET /v1/sharing` lists what the person shares, `share.revoke` revokes one invitation, and Shared with me groups what's shared with them by owner. The sidebar's places are a fixed list in `tree.ts`.

## Decisions

- **Counts on each person** (`GET /v1/people` gains `yours` and `theirs`, the creator's choices on 18 November 2026): `yours` counts the owner's folders and lists outside Trash with an open invitation to them, and those to edit; `theirs` counts theirs the owner accepted and can open now. Pending invitations from them aren't "shared with you" yet: the person's page shows them.
- **`GET /v1/people/{id}`** gives the person and both lists, by name. Theirs are their pending invitations to the owner on folders and lists outside Trash, with the grant's id for the invitation page, and the accepted ones that open. Anyone else is 404, as a container not one's own is.
- **`share.revokePerson {personId}`** moves each of the owner's pending or accepted grants to that person to `revoked` through the store's `moveGrant`, as `share.revoke` does, Trash included, so a recovery never resumes one (FR-07.10). It answers `{ revoked }`, 0 for anyone without one. App-only through `actingOwner`.
- **Hiding:** `people_hidden (user_id, person_id, hidden_at)`, one row a pair. `people.remove {personId}` sets `hidden_at` to now. `connections` drops a hidden person whose latest connection is no later than `hidden_at`: a grant the owner made counts from its creation, one to them from its acceptance. So a new invitation either way brings them back with no row to delete, and a hidden person can't be invited by id. Account deletion's purge removes the rows on both sides (TS-74).
- **Pages:** `/people` (`features/sharing/people.tsx`) and `/people/$personId` (`person.tsx`). The field reuses `findPeople`. Yours open the shell's sharing dialog (`startShare`); the page reads again when it closes. Stop sharing and Remove from People show from 768 px, as Share does; a phone reads only. The tree's places gain `people` after `shared`.

## Risks

- `hidden_at` and a grant's times come from two clocks only in tests; in the app both are the database's or the API's, a second apart at most.
