# Tasks

## 1. The owner's dialog

- [x] 1.1 Role selects on the invite form (Can view by default) and on each row (`share.setRole`, saved at once), the "Also editable through" note, and the editing disclosure in the description. The e2e test in `share-roles.e2e.ts`: "Inviting to edit", "Changing a role", "Editing through a folder", and the disclosure ("A folder's disclosures").

## 2. The person

- [x] 2.1 The invitation email's template and `invitationToDeliver` carry the role. An API test in `invitations.test.ts`: the email of an invitation to edit ("The inbox", its email half).
- [x] 2.2 The inbox row, the new-invitation notice, Shared with me and the tree's mark. The e2e test: "The inbox" and "Shared with me".

## 3. Docs and verification

- [x] 3.1 DS-65–DS-67 and the landing copy, as built.
- [x] 3.2 `bun run format` twice, then the full `bun run check` passes locally.

## Workflow follow-up

- Archive as the PR's last commit, check the merged spec, open the PR with `Closes TON-190`, and merge.
