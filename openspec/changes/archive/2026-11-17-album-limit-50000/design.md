# Design

## Context

The album limit has been 5,000 since TON-60, and it was also Q-01's reference workload. The creator raised it to 50,000 on 17 November 2026, and chose to keep the targets set at 5,000 and to measure once at 50,000.

## Decisions

### 1. One constant each

`maxAlbums` becomes 50,000 and `maxMemberships` 100,000, in `packages/domain/src/limits.ts` (TS-18). The refusal, the meter and MCP's overview read the constants, so only tests and docs state the numbers.

### 2. A larger request limit

`maxOrderItems` is `maxAlbums`, so one move may place 50,000 items. A first move past every album of an unarranged view sends them all in one `order.set`: 4.29 MB for 50,000, measured with the client's own key shape. The API's 4 MiB cap would answer `413`, so it becomes 8 MiB.

*Alternative:* splitting a large first move into several mutations. A move is one transaction with one `base` (TS-21), so splitting it would break its all-or-nothing rollback.

### 3. Trash purges stay at 5,000 units

The app already empties a fuller Trash with several purges in one batch (TON-148). A larger cap would only make each request bigger.

### 4. One measurement at 50,000

`scaledWorkload(albums)` keeps the reference workload's fields and shares, and gives the owner more albums in more lists: up to 6 times the lists and twice the folders, within the 2,000 folders and lists. Real lists hold a few hundred albums at most (the creator, 17 November 2026), so no list takes more than 500. At 50,000 that is 1,500 lists and about 90,600 list entries, within the new limit. `WORKLOAD_ALBUMS=50000` seeds it for the perf suite (`test:perf`) and the real-app suite (`test:verify`). Both run once, beside today's runs at 5,000, and the numbers go into the performance report.

### 5. `test:verify` runs again

It had stopped at sign-in since TON-102, which waits for the sync engine through the test hooks that its web server didn't turn on, and then at the terms that came with TON-131. Its config sets `TEST_HOOKS`, and the workload's accounts have agreed to the current terms, as the e2e accounts do.

## Risks / Trade-offs

- **[Big collections are slower than the targets]** → The targets aren't promised at 50,000. The measurement found the cold start, views and edits, and quick search on phones slow; they are TON-288, TON-289 and TON-290.
- **[Exports grow tenfold]** → The archive is built in memory (TS-80). At 50,000 it took 1.17 s, against 3 s.
