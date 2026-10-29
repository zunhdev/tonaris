# Tonaris — Q-01 performance verification, 29 October 2026

[TON-92](https://linear.app/zunhdev/issue/TON-92) runs TS-120's measurements on the reference workload, on both reference profiles. It re-checks the targets approved after [TON-21](spikes/2026-10-21-q01-measurements.md), and measures the four still provisional on the real app.

## Verdict

**Every target is met, most with wide room to spare.** The creator approved the four provisional targets as they stood, on 29 October 2026.

| Metric (TS-120) | Target | Desktop | Mobile | Status |
| --- | --- | --- | --- | --- |
| Optimistic feedback after an edit | ≤ 50 ms p95 | 3 ms | 7 ms | Approved |
| Server confirmation of a mutation | ≤ 400 ms p95 | 188 ms | 392 ms | Approved (see the notes) |
| Propagation to another session | ≤ 1 s p95 | 19 ms | 94 ms | Approved |
| Propagation to a viewer (refetch) | ≤ 2.5 s p95 | 117 ms | 616 ms | Approved |
| Opening a list | ≤ 100 ms p95 | 19 ms | 33 ms | Approved |
| Opening or sorting the 5,000-album list | ≤ 200 ms p95 | 52 ms | 92 ms | Approved |
| Sorting a list | ≤ 100 ms p95 | 16 ms | 26 ms | Approved |
| Workspace cold start (desktop p75) | ≤ 2.5 s | 0.76 s | 2.0 s (not a target) | Approved |
| Quick search, per keystroke | ≤ 50 ms p95 | 8 ms | 10 ms | **Approved 29 Oct** |
| MCP search, server time | ≤ 300 ms p95 | 14 ms | — | **Approved 29 Oct** |
| Guest page LCP (mobile p75) | ≤ 2.5 s | — | 0.74 s | **Approved 29 Oct** |
| Export of 5,000 albums | ≤ 3 s | 0.21 s at most | — | **Approved 29 Oct** |

## How it was measured

- **Profiles:** TS-120's, through Chrome DevTools' throttling in Playwright Chromium, as TON-21 set them up.
  - **Desktop:** 50 Mbit/s and 30 ms latency, CPU not slowed.
  - **Mobile:** a Pixel 7 viewport on "Fast 4G", with the 4× CPU slowdown.
- **The approved targets:** the TON-21 suite, `bun run --cwd apps/web test:perf` (`perf/q01.perf.ts`). It runs on its perf page, with the web app's real sync client, against a fresh copy of the workload.
- **The provisional targets:** `bun run --cwd apps/web test:verify` (`perf/app.verify.ts`). It starts the real API and the production web app on the local database, whose `workload@tonaris.test` holds the workload (`bun run seed:workload`), and measures:
  - **Quick search:** from each keystroke to the palette's next rendered change, typing four words a letter at a time. That's 29 keystrokes per profile, under the palette's 150 ms pause, so shared content is searched only after each word.
  - **Guest page:** the browser's own largest contentful paint on five cold visits. The share is the workload's largest root folder, whose lists hold 2,066 entries. The link is turned off afterwards.
  - **Export:** three downloads of the 5,005-album archive, end to end.
- **MCP search:** `searchCollection`, the `search` tool's own call, timed 40 times on the workload with 20 words and a limit of 50. The SDK's framing adds a millisecond or two, as TON-85's live runs showed.
- **One run each:** the margins are wide (TS-120).

## Notes

- **Edit confirmation rose about 80 ms since TON-21,** from 112 to 188 ms on desktop and from 286 to 392 ms on mobile.
  - **Not the server:** an edit's request takes 4 ms at the median, and the mutation itself 2 ms (p95 5 ms).
  - **The cause:** the rise is the browser keeping each write in its outbox until the server answers (TS-22), so a reload can't lose it. TON-21's prototype didn't keep writes.
  - **On mobile,** Fast 4G's 165 ms latency is most of the rest, so the margin there stays thin while the stack holds.
  - **No change was made.** The target is met, and dropping durability to speed it up would trade a promise (FR-13) for milliseconds.
- **Viewer propagation,** approved on 21 October on an estimate, is now measured: a 2,000-album viewer's refetch takes 117 ms on desktop and 616 ms on mobile.
- **Raw results** are committed in `apps/web/perf/results/`: `desktop.json`, `mobile.json` and `verify.json`.
