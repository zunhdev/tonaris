# Tonaris — accessibility walkthrough

The walkthrough checklist for Q-02 and AC-42 (DS-115, TS-122; TON-93). The checklist has one row per step, and each
step runs once per matrix entry. The keyboard entries are automated. The screen-reader entries are done by hand on
real devices: the creator's.

## The matrix (TS-122)

| Entry | Browser | Screen reader | How |
| --- | --- | --- | --- |
| K1 | Chrome and Edge (Chromium) | — | Automated: `bun run test:e2e` |
| K2 | Firefox | — | Automated: `bun run --cwd apps/web test:e2e:firefox`, run by the creator (the agent's sandbox can't start Firefox) |
| K3 | Safari (WebKit), desktop and iPhone | — | Automated: `bun run --cwd apps/web test:e2e:webkit` |
| S1 | Safari, macOS | VoiceOver | By hand |
| S2 | Safari, iOS | VoiceOver | By hand, mobile browsing scope |
| S3 | Firefox, Windows | NVDA | By hand |
| S4 | Chrome, Windows | NVDA | By hand |
| S5 | Chrome, Android | TalkBack | By hand, mobile browsing scope |

## What the automated walkthroughs check

The automated walkthroughs are `apps/web/e2e/walkthrough.e2e.ts` and the consent and approval pages in
`approvals.e2e.ts`. On each page, by keyboard alone:

- **axe** finds nothing on the page as it opens (WCAG 2.2 AA and best practice).
- **Every Tab stop** has a role and a name to announce, and shows DS-115's ring: 2 px, solid.
- **Focus** goes from the top of the page to its end and leaves; it never goes round.
- **A modal dialog** (the palette, Share) keeps focus inside while it's open. **A popover** (View options) lets Tab go on to the page. Both give focus back to what opened them on Escape.

**Pages walked:**
- **Signing in:** the form, the code screen, and arriving signed in, typed with the keyboard alone.
- **The workspace:** Collection, a list, Unsorted, Trash, Shared with me, Invitations, and every Settings page.
- **Admin:** Admissions, Members and Operations.
- **The guest page** of a shared list, in a browser with no session.
- **Failure pages:**
  - an unavailable share link;
  - an unusable invitation;
  - a recovery link;
  - a page that doesn't exist;
  - the email-recovery help.
- **The consent page** of an AI connection, and **the approval page** of a gated delete.

The feature tests cover the keyboard paths inside the workflows:
- **Navigation:** the sidebar tree and the grid (`collection-navigation`).
- **Arranging:** every drag's keyboard path (`manual-order`).
- **Editing:** the inspector, cells and links (`album-inspector`, `editing-modes`, `service-links`).
- **Search and commands:** the palette (`search`, `palette-commands`).
- **Saving:** save states and their announcements (`save-states`, `batch-report`).
- **The phone shell:** drill-down browsing and its sheets, checked by axe (`mobile`).

## The screen-reader checklist

Run each step with the entry's screen reader, in its usual browsing and focus modes. A step passes when every part of
it is announced in words: what the control is, its name, its state, and what happened.

**Signing in** (S1–S5)
1. On `/sign-in`, the email field is announced by name. **Continue** sends the code.
2. The code screen announces the address the code went to. A wrong code is announced as an error, with what to do.
3. After the code, the Collection page's heading is announced.

**Owned browsing** (S1, S3, S4; S2 and S5 in the phone shell)
1. The sidebar is a tree. Each folder and list announces its name, its level, and whether it's expanded. Arrow keys move through it.
2. A list's albums are a grid, which announces its row count. Each row reads the title, the artist and the year.
3. Opening an album announces the inspector, or on a phone the sheet, and its title. Closing it returns to the row.
4. **On a phone:** the top bar's back button names where it goes. Folders and lists open by drilling down.

**Search and service choice** (S1–S5)
1. The palette opens on its shortcut, or from Search on a phone. Its field is announced as a combobox. Results announce their kind and their count as they change.
2. **Open in…** names each service, and leaves the page when chosen.

**Desktop editing** (S1, S3, S4)
1. Editing a field in the inspector announces the field's name. A save is announced as saved; a failed save, as failed, with Retry.
2. **Move to…** and the keyboard reordering announce where the item went.
3. Deleting announces that the item is in Trash, with Undo. Trash lists it, and **Restore** brings it back.
4. **View options:** the popover's choices announce their names and current values.
5. **Sharing:** the Share dialog announces its disclosures before anything can be shared. Its toggles announce their states.

**Account and administration** (S1, S3, S4)
1. The Settings pages announce their headings and fields. Deleting the account announces its warning and what to type.
2. **Admin → Admissions, Members and Operations:** each table reads by row, and each action names its member.

**Guest views** (S1–S5)
1. A share link's page announces the list's name and who shared it, without a session.
2. A folder's lists open, and the back link names where it goes.
3. An unavailable link announces only its sentence.

**Failure, pending and saved states** (S1–S5)
1. **Offline:** the sync status announces that changes are kept and will be sent. Back online, it announces they were sent.
2. **A conflict:** the save state announces it and offers the choice.
3. **The other failures** each announce one plain sentence:
   - an unusable invitation;
   - an expired recovery link;
   - a page that doesn't exist.

**Confirmations and approvals** (S1–S5)
1. **The consent page:** the agent's name, the two modes as radio buttons with their descriptions, then **Connect**.
2. **The approval page:**
   - it announces the agent and what it asks;
   - each part of the scope ("1 album") is a button that announces whether it's expanded;
   - **Approve** and **Decline** announce the result.

**Things to listen for** (from TON-93's automated pass)
- **Dialog edges.** In a modal dialog, Tab at the last control touches the page behind it for a moment, and Base UI brings focus back. Check that the screen reader doesn't announce the page behind (S1, S3, S4).
- **Focus guards.** In Safari, Base UI's focus guards, which keep focus inside a dialog, have `role="button"` and no name. Check that VoiceOver doesn't land on an unnamed button when swiping through a dialog or sheet (S1, S2).

## Results

| Area | K1 | K2 | K3 | S1 | S2 | S3 | S4 | S5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Signing in | Pass, 30 Oct 2026 | Creator | Pass, 30 Oct 2026 | | | | | |
| Owned browsing and search | Pass, 30 Oct 2026 | Creator | Pass, 30 Oct 2026 | | | | | |
| Desktop editing | Pass, 30 Oct 2026 | Creator | Pass, 30 Oct 2026 | | — | | | — |
| Account and administration | Pass, 30 Oct 2026 | Creator | Pass, 30 Oct 2026 | | — | | | — |
| Guest views | Pass, 30 Oct 2026 | Creator | Pass, 30 Oct 2026 | | | | | |
| Failure, pending and saved states | Pass, 30 Oct 2026 | Creator | Pass, 30 Oct 2026 | | | | | |
| Confirmations and approvals | Pass, 30 Oct 2026 | Creator | Pass, 30 Oct 2026 | | | | | |

"—" is outside the phone's scope (X-04): editing and administration are desktop only. A blank cell is a pass still to
run.

## Fixed in TON-93

- **Focus rings** (DS-115). Some controls had no ring:
  - plain links, such as **Lost access to your email?** and the not-found page's link, which showed the browser's default ring;
  - the sidebar's resize handle, which showed only a tint;
  - the palette's field.

  A base-layer rule now gives DS-115's ring to anything that draws none of its own. The handle and the palette's field draw theirs.
- **The approval page's scope parts** were `<details>` elements. Safari exposes their `<summary>` without a role, so each part is now a button that announces whether it's expanded.
