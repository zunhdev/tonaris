# Tonaris — acceptance walkthrough

The first version's results against the PRD's acceptance checks, AC-01 to AC-46 (section 7; TON-98). Walked
through on 30 October 2026, on `main` after TON-102.

**Results:** 42 of the 46 pass. Four wait for the creator, on the hosted service or real devices.
- **Automated (40):** tests exercise the check end to end, and `bun run check` runs them.
  - Browser tests are in `apps/web/e2e/`.
  - API tests are in `apps/api/src/`.
  - Database and domain tests are in `packages/db/src/` and `packages/domain/src/`.
- **Verified (2):**
  - **AC-36:** a recorded live run in the three AI clients.
  - **AC-46:** a recorded review of the scope.
- **Waits for the creator (4):** AC-18, AC-42, AC-43 and AC-44.

The PRD has no open **Pending approval** items (section 9). Q-01's targets were approved on 29 October 2026, and
Q-04's objectives on 30 October 2026.

## Results

| AC | Check | Result | Evidence |
| --- | --- | --- | --- |
| AC-01 | Register and return | Pass | `admission.e2e.ts`: an invited person joins and returns to the same account. `admissions.test.ts`: pausing keeps members. `sharing.test.ts`: inviting a non-member admits no one. |
| AC-02 | Administer admissions | Pass | `admissions.test.ts`: creator only, forwarded codes, retried registration. `auth/admission.test.ts`: simultaneous joins make one account. `admission.e2e.ts`. |
| AC-03 | Organize containers | Pass | `domain/containers.test.ts`: no sibling collisions. `descriptions.e2e.ts`. `db/container-descriptions.test.ts`: kept through Trash, not searched. `db/sharing.test.ts` and `guests.test.ts`: viewers get them live. |
| AC-04 | Move folders and lists | Pass | `domain/containers.test.ts`: moves, cycles, destinations, collisions. `db/sharing.test.ts`: moves update access and keep direct shares. |
| AC-05 | Reuse albums across lists | Pass | `domain/memberships.test.ts`. `search.e2e.ts`: an album in no list opens in Unsorted. `usage.e2e.ts`. |
| AC-06 | Capture supplied links | Pass | `capture.e2e.ts`: the four services, track links, and failures that keep the link. `providers/identify.test.ts`: Qobuz and Tidal tracks go to manual entry. |
| AC-07 | Save without a list | Pass | `api/capture.test.ts`: into Unsorted, and out of Trash with only the requested list. `domain/capture.test.ts`. `mcp/write-tools.test.ts`. |
| AC-08 | Required information | Pass | `album-form.test.ts`. `album-inspector.e2e.ts`. `api/capture.test.ts`. `mcp/write-tools.test.ts`. |
| AC-09 | Identify and match | Pass | `api/capture.test.ts`: another edition reuses it; an uncertain match waits while the batch goes on. `providers/album-facts.test.ts`. |
| AC-10 | Correct and enrich | Pass | `domain/memberships.test.ts`. `db/enrichment.test.ts`: fills only gaps. `domain/commands.test.ts`: chronology. |
| AC-11 | Optional fields | Pass | `custom-fields.e2e.ts`. `domain/field-values.test.ts`. |
| AC-12 | Definitions and options | Pass | `domain/fields.test.ts`. `domain/field-options.test.ts`. `db/field-options.test.ts`. `db/field-deletion.test.ts`. |
| AC-13 | Change field types | Pass | `domain/field-options.test.ts`. `custom-fields-settings.e2e.ts`. |
| AC-14 | Chronology | Pass | `collection/order.test.ts`. `view-options.e2e.ts`. `providers/album-facts.test.ts`. |
| AC-15 | Sorting and grouping | Pass | `collection/order.test.ts`. `view-options.e2e.ts`. `providers/classify.test.ts`. |
| AC-16 | Personal presentation | Pass | `view-options.e2e.ts`: remembered and synced. `shared-viewing.test.ts`. `guest.e2e.ts`: the visit's own view. |
| AC-17 | Unsorted and root presentation | Pass | `view-options.e2e.ts`. `manual-order.e2e.ts`: rearranging changes no list or parent. |
| AC-18 | Open the selected service | **Waits for the creator** | `open-in.e2e.ts` covers the chooser, the links, the phone sheet and the link setting (revised 30 October 2026, TON-104: web page or app, by setting). **Left:** launching each desktop app from Chrome, Safari and Firefox with the apps installed, and app links on real phones (`spikes/2026-10-28-desktop-app-links.md`). |
| AC-19 | Same-service link conflicts | Pass | `domain/capture.test.ts`. `api/capture.test.ts`. `capture.e2e.ts`. `providers/links.test.ts`: variants. |
| AC-20 | Sharing inheritance | Pass | `db/sharing.test.ts`. `domain/sharing.test.ts`. |
| AC-21 | Sharing disclosure | Pass | `sharing-dialog.e2e.ts`. `sharing-impact.e2e.ts`. `mcp/trash-tools.test.ts`. |
| AC-22 | Invitations | Pass | `sharing.test.ts`: `recipient_not_found`. `invitations.test.ts`. `invitations.e2e.ts`. |
| AC-23 | Leave and revoke | Pass | `revoke.test.ts`. `sharing.test.ts`: a link turned on again is new. |
| AC-24 | Saved references | Pass | `shared.test.ts`. `shared-with-me.e2e.ts`. `domain/sharing-commands.test.ts`: Read-only agents are refused. |
| AC-25 | Search | Pass | `search.e2e.ts`. `shared-search.test.ts`. `db/search.test.ts`. `mcp/mcp.test.ts`: the same order as the app (X-02). |
| AC-26 | Guest browsing | Pass | `guest.e2e.ts`. `search.test.ts`: global search needs a session. |
| AC-27 | Delete and recover containers | Pass | `trash.e2e.ts`. `recovery.e2e.ts`. `domain/trash.test.ts`. |
| AC-28 | Trash units | Pass | `domain/trash.test.ts`: a property test. `db/trash.test.ts`. |
| AC-29 | Delete, recover, re-add albums | Pass | `domain/trash.test.ts`. `domain/capacity.test.ts`. `domain/capture.test.ts`. `album-trash.e2e.ts`. |
| AC-30 | Sharing during Trash | Pass | `db/sharing.test.ts`. `revoke.test.ts`. `shared-search.test.ts`. |
| AC-31 | Expire and clear Trash | Pass | `trash-view.e2e.ts`. `db/trash.test.ts`. `domain/trash.test.ts`. |
| AC-32 | Capacity | Pass | `domain/capacity.test.ts`: Trash counts; a refusal gives the reason. `db/sync.test.ts`: at the limit, a batch refuses each new album and its list and link adds go through (added in TON-98). `usage.e2e.ts`. |
| AC-33 | Sync and conflicts | Pass | `client/sync/sync.test.ts`. `save-states.e2e.ts`. |
| AC-34 | Partial batches and retries | Pass | `batch-report.e2e.ts`. `client/sync/sync.test.ts`. |
| AC-35 | Connection loss | Pass | `save-states.e2e.ts`. `sync-client.e2e.ts`. `client/sync/sync.test.ts`. |
| AC-36 | MCP clients | Pass (verified) | `mcp-verification.md`, Results: steps 1, 2, 6 and 9 in all three clients on 29 October 2026. `spikes/2026-10-21-g3-approvals.md`. `mcp/approvals.test.ts`. `mcp/trash-tools.test.ts`. |
| AC-37 | App-only boundaries | Pass | `mcp/write-tools.test.ts`: the exact tool list, and app-only commands refused in every mode. `mcp/mcp.test.ts`. |
| AC-38 | Owner identification | Pass | `settings-profile.e2e.ts`. `sharing.test.ts`. `guests.test.ts`. `invitations.test.ts`. |
| AC-39 | Email change and recovery | Pass | `email-change.test.ts`. `email-recovery.test.ts`. `settings-account.e2e.ts`. `email-recovery.e2e.ts`. |
| AC-40 | Delete the account | Pass | `account-deletion.test.ts`. `account-deletion.e2e.ts`. `export.e2e.ts`: the export is offered first. |
| AC-41 | Export data | Pass | `api/export.test.ts`. `db/export.test.ts`. `domain/export.test.ts`. `tooling/src/export-validator/validate.test.ts`. |
| AC-42 | Browsers and accessibility | **Waits for the creator** | `accessibility-walkthrough.md`: Chromium and WebKit pass every area. **Left:** the Firefox run, the five screen-reader passes, real iOS and Android devices, and Edge itself, which runs as Playwright's Chromium. |
| AC-43 | Performance and costs | **Waits for the creator** | `performance-verification.md`: every target met on both profiles, approved 29 October 2026. **Left:** the quota review and cost check before admission expands, which are the creator's, as hosting and budget are. |
| AC-44 | Recover the hosted service | **Waits for the creator** | `runbooks/restore.md`: the drill passed on 30 October 2026, on the development database. `db/ledger.test.ts`. `account-deletion.e2e.ts`: the backup disclosure. **Left:** daily backups on the hosted service, and a drill from a hosted backup. |
| AC-45 | Reject hostile input | Pass | `adversarial.test.ts`. `adversarial.e2e.ts`. `providers/safe-fetch.test.ts`. `security.test.ts`. `security.e2e.ts`. `mcp/limits.test.ts`. |
| AC-46 | Language and scope | Pass (reviewed) | The scope review below. Multilingual text is saved and shown in `capture.e2e.ts` ("Idéal"), searched in `search-index.test.ts` ("BJÖRK"), and identified in `providers/identify.test.ts` ("Икра"). |

## Claims that hold by how it's built

The tests above cover these checks, but a few of their claims hold because of how the code is built, with no
test of their own:
- **AC-01:** there's no country restriction or account cap, because no code for one exists.
- **AC-04:** view preferences survive a move, because they're kept by container ID.
- **AC-10:** there's no value history, because there's no table for one. `audit_log` records only account deletion, email change and email recovery.
- **AC-17:** rearranging changes no access, because positions aren't part of sharing.
- **AC-24:** guests can't change saved references, because they have no session to write with.
- **AC-27:** a unit's expiry stays put while recovery asks a question. The tests check that the unit is still in Trash, not its expiry date.
- **AC-41:** the export is one point in time, because it reads in one `REPEATABLE READ` transaction (`packages/db/src/export.ts`). No test writes while it exports.

## The scope review (AC-46)

Each of section 2.6's exclusions, checked against the code on 30 October 2026:

| Excluded | Holds | How it was checked |
| --- | --- | --- |
| In-app playback, audio hosting, downloads | Yes | The web app has no `<audio>` or `<video>`. Opening an album leaves for the service (`open-in.e2e.ts`). |
| Sync with streaming libraries | Yes | The Spotify bridge uses client credentials only (`providers/src/spotify.ts`), so it never reaches a user's library. |
| Track items | Yes | The database has no track table. Track links resolve to their album (`capture.e2e.ts`). |
| Discovery feeds, follows, comments, profiles | Yes | No such tables or routes. Sharing is by invitation or link. |
| Collaborative editing | Yes | Shared views are view-only (`shared-viewing.e2e.ts`). |
| Built-in recommendations | Yes | The MCP tool list has no recommendation tool (`mcp/write-tools.test.ts`). |
| Automatic listening history | Yes | No predefined listening fields, and no import. Opening a link changes no field. |
| Importing or restoring exports | Yes | No import route. `restore.ts` is the operator's backup restore, not a user import. |
| Viewer exports | Yes | The export leaves out other owners' content (`db/export.test.ts`). |
| Full edit history | Yes | Current values only. `audit_log` holds account events, not edits. |
| Custom-field constraints | Yes | Basic type checks only (`domain/field-values.test.ts`). |
| Preferred-service setting | Yes | No such setting. The chooser asks each time (`open-in.e2e.ts`). |
| Search in guest shares; typo-tolerant search | Yes | The guest page has no search, and global search needs sign-in (`search.test.ts`). Matching is by substring (`db/search.test.ts`). |
| Per-list MCP scopes | Yes | Consent covers the whole collection, in one of two modes. |
| Editing in mobile browsers | Yes | Phones get Viewing mode (`mobile.e2e.ts`). |
| Password and provider sign-in | Yes | `emailAndPassword` is off and no social providers are set (`apps/api/src/auth/auth.ts`). |
| Offline use; translations | Yes | No service worker. The interface is English (`<html lang="en">`). |
| Independent installations | Yes | Only the creator's hosted service is documented (`docs/deploy.md`). |

## Left for the creator

1. **AC-18:** with the apps installed and Settings → Preferences → "Open links in" set to App, open an album's service app from Chrome, Safari and Firefox on the desktop, and from a phone.
2. **AC-42:**
   - run `bun run --cwd apps/web test:e2e:firefox`;
   - run the screen-reader checklist in `accessibility-walkthrough.md`;
   - browse on a real iPhone and Android phone;
   - open the app once in Edge.
3. **AC-43:** review the providers' quotas and the running cost before admission expands.
4. **AC-44:** schedule `backup.ts` on the hosted service, then run a restore drill from a hosted backup (`runbooks/restore.md`).
