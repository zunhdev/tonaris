# Tasks

## 1. Web

- [x] 1.1 Add `/settings/profile` and Profile in the subnav (design decisions 1 and 2). Verify with Playwright in `settings-profile.e2e.ts`:
  - setting "Mira" on blur saves it, the account menu reads Mira, and it's there after a reload;
  - clearing it while sharing nothing brings back the email in the menu;
  - with a link on, clearing is refused with the sentence, and the field shows the saved name;
  - axe finds no violations;
  - the subnav marks Profile.

## 2. Verification

- [x] 2.1 Confirm AC-16's defaults part through `view-options.e2e.ts` ("choices are remembered per view and synced, and defaults apply where none was made"), and AC-38's server guard through the sharing tests. Verify that both pass in the full check.

## 3. Docs

- [x] 3.1 Record DS-92's subnav and DS-93's display name as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
