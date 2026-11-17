# Proposal

Linear: TON-287 (Feature). Implements FR-15.1 and FR-15.4. Tech: TS-18, TS-120. Done when a 50,001st album is refused with the new number, Settings → Data and MCP's overview show the new limits, and the PR reports one measurement at 50,000 albums.

## Why

On 17 November 2026 the creator asked to raise the album limit from 5,000 to 50,000. At 50,000 albums, today's cap of 50,000 list entries would allow about one entry per album. The reference workload averages 1.8.

## What Changes

- **Albums per account, Trash included:** 50,000, up from 5,000 (FR-15.1). The refusal, the usage meter, the capture notice from 95% and MCP's overview all read the new number.
- **List entries per account, Trash included:** 100,000, up from 50,000 (FR-15.4), about 2 per album. The creator chose this on 17 November 2026.
- **The largest request the API reads:** 8 MiB, up from 4 MiB. The first move in an unarranged view of 50,000 albums keys them all in one `order.set` of about 4.3 MB.
- **Performance:** Q-01's approved targets stay set on the 5,000-album reference workload (the creator's choice, 17 November 2026). The perf suites run once at 50,000 albums, and the numbers are recorded. Anything too slow gets its own issue.
- **The workload seeder** takes `WORKLOAD_ALBUMS`, which gives the owner that many albums in more lists of at most 500 albums each.
- **`test:verify` works again:** the workload's accounts have agreed to the terms (TON-131), and its web server runs with the test hooks that signing in waits on (TON-102).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `capacity-limits`: the album limit is 50,000.
- `album-records`: the list-entry limit is 100,000.
- `mcp-access`: the overview reports the new limit.

## Impact

- **`packages/domain`:** `maxAlbums` and `maxMemberships`. `maxOrderItems` follows `maxAlbums`. `maxPurgeUnits` stays 5,000, since the app already splits a fuller Trash into several purges (TON-148).
- **`apps/api`:** `maxRequestBodySize`. The OpenAPI document doesn't change.
- **`tooling`:** `scaledWorkload`, `WORKLOAD_ALBUMS`, and the workload's agreement to the terms.
- **`apps/web`:** `TEST_HOOKS` in the verify suite's config.
- **Docs:** FR-15.1, Q-01, AC-32, section 8 and the change log; TS-18, TS-120 and the TON-95 note; DS-98; the performance report; the README and the break-ui catalog.
