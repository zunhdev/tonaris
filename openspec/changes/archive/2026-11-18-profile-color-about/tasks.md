## 1. Data and rules

- [x] 1.1 `user.avatar_hue` and `user.about` (migration), `maxAboutLength`, `avatarHues`.
- [x] 1.2 `account.setAvatarColor` and `account.setAbout`, app-only, with the store's setters.
- [x] 1.3 `avatarHue` on the account, the dialog's invitations, people, owners and the snapshot; `about` on a person's read for their people only.

## 2. The app

- [x] 2.1 `Avatar` with a hue; Settings → Profile's swatches and About.
- [x] 2.2 Owners' avatars in Shared with me, the Invitations inbox and notices, the Shared by pill and guest pages.
- [x] 2.3 The Shared by card, and the About on a person's page.
- [x] 2.4 The privacy notice and `termsVersion`.

## 3. Words and tests

- [x] 3.1 FR-11.16, FR-11.13, FR-08.4 and the decision log; DS-31, DS-70, DS-93, DS-121; TS, as built in TON-296.
- [x] 3.2 Unit and store tests: the commands, the limit, who reads the About.
- [x] 3.3 API tests: the account, a person's About both sides, a guest's snapshot.
- [x] 3.4 Browser tests: Settings → Profile, the color in the dialog and People, the Shared by card, and a guest page.
