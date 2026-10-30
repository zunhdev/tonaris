# Proposal

Linear: TON-111 (Feature). Implements FR-10.5, FR-03.3 and FR-02.6 for agent captures. Tech: TS-41 step 4. Done when an agent's capture that falls back to details is matched and enriched when exactly one album passes the strict rule.

## Why

In the creator's manual testing (30 October 2026), Claude added five Metallica albums from Tidal links, and only two got artwork. MusicBrainz knew those two Tidal links (step 2). The other three asked for details, and Claude's title, artist and year were saved as typed: no release group, so no enrichment and no artwork.

Agent captures skip step 4 because Tonaris doesn't read Tidal's or Qobuz's pages for agents (FR-10.5). The details an agent sends back don't come from those pages, so they can stand in for step 4's hints.

## What Changes

- **An agent's details are matched:** when an MCP capture of an unidentified link is resent with `details`, step 4's strict rule runs on their title, artist credit and original year.
- **Exactly one album passes:** the capture saves as identified. The agent's values are kept, MusicBrainz fills only what they leave unknown, artwork included (FR-03.3), and an album already in the collection is reused.
- **None or several pass, or no original year:** the album is saved as entered, as before. No new question is asked.
- **MusicBrainz unavailable:** the capture fails as `provider_unavailable`, as other captures do.
- **The app is unchanged:** manual entry adds an album without a lookup (FR-02.4), and the app's step 4 already reads the store page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-capture`: an agent's details for an unidentified link are matched strictly.

## Impact

- **`packages/providers`:** the identifier's `matchDetails`, step 4's rule on details.
- **`packages/domain`:** an identified capture from matched details fills only what the details leave unknown.
- **`apps/api`:** `prepareCapture` matches an MCP capture's details; the capture fixtures stub it.
- **Docs:** FR-10.5, TS-41.
- **No API contract change.**
