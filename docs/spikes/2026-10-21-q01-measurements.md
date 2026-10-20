# Tonaris — Q-01 measurements of the sync prototype, 21 October 2026

Spike for [TON-21](https://linear.app/zunhdev/issue/TON-21). It measures the [TON-20 sync prototype](2026-10-20-sync-prototype.md) against the provisional targets of [TS-120](../tech-spec.md), on the reference workload, and proposes confirmed targets. Recording the decisions is [TON-25](https://linear.app/zunhdev/issue/TON-25)'s.

## Verdict

**Everything measurable today meets its target with room to spare.**

- **Proposal:** confirm those targets as they are, and keep the rest provisional until there is something to measure.
- **One change recommended:** compress the API's JSON responses.

| Metric (TS-120) | Target | Desktop | Mobile | Proposal |
| --- | --- | --- | --- | --- |
| Optimistic feedback after an edit | ≤ 50 ms | 4 ms | 9 ms | Confirm |
| Server confirmation of a mutation, through the stream | ≤ 400 ms | 112 ms | 286 ms | Confirm |
| Propagation to another session of the account | ≤ 1 s | 17 ms + 1 RTT ≈ 50 ms | 55 ms + 1 RTT ≈ 120 ms | Confirm |
| Propagation to a viewer (invalidate, then refetch) | ≤ 2.5 s | ≈ 0.5 s, estimated | ≈ 1.4 s, estimated | Confirm; measure in M7 |
| Opening a list | ≤ 100 ms | 13 ms | 41 ms | Confirm |
| Opening or sorting the 5,000-album list | ≤ 200 ms | 50 ms | 128 ms | Confirm |
| Sorting a list | ≤ 100 ms | 17 ms | 29 ms | Confirm |
| Workspace cold start, assets cached (p75, desktop) | ≤ 2.5 s | 0.74 s | 3.3 s (not a target) | Confirm |
| Quick search, MCP search, guest page LCP, export | as TS-120 | — | — | Keep provisional: nothing to measure yet |

Figures are p95 unless the row says otherwise.

## How it was measured

- **Workload.** The TS-120 reference workload:
  - 5,000 albums in 250 lists and 60 folders, with 9,017 list entries;
  - 3 shared collections.

  It is seeded fresh into a `tonaris_perf` database on each run by `apps/api/src/perf-server.ts`. To make lists measurable, the bootstrap now also carries folders, lists and list entries, read-only.
- **Page.** [`apps/web/perf/`](../../apps/web/perf/) is a production-built React page on the web app's real sync client:
  - a sidebar with the lists;
  - a virtualized album list (TanStack Virtual, 36 px rows);
  - a sort toggle, and an input that edits the first album's year.

  Each timer runs from the click or Enter to the React render that shows the result.
- **Devices.** One Playwright run in Chromium, with Chrome DevTools' throttling ([`perf/q01.perf.ts`](../../apps/web/perf/q01.perf.ts)):
  - **desktop:** 50 Mbit/s and 30 ms latency, CPU not slowed (the creator's M4 Max is faster than the reference M1);
  - **mobile:** DevTools' "Fast 4G" and its 4× CPU slowdown, in Pixel 7 emulation.
- **Samples.** Per profile:
  - 3 cached cold starts;
  - 21 list openings and 5 openings of All albums;
  - 6 sorts each of All albums and of a list;
  - 20 edits watched by a second session of the account;
  - 5 refetches of a 2,000-album collection.

  The raw samples are in [`apps/web/perf/results/`](../../apps/web/perf/results/).

## Notes

- **Compress the API's responses.**
  - The bootstrap for the reference workload is 2.33 MB of JSON and is sent uncompressed. Gzipped it is 0.49 MB.
  - That is most of a cold start: about 0.4 s of the desktop's 0.74 s, and over 2 s of mobile's 3.3 s on Fast 4G.
  - Either the API or the host's edge can compress, as long as the event stream is left alone.
- **List entries are the largest part of the bootstrap:** 1.23 MB, more than the albums. Grouping them by list would roughly halve that. That's for TON-29, which brings these entities into sync properly.
- **Chrome's throttling delays each request, but not the events of an open stream.**
  - So the second session's propagation shows almost no network time; the table adds one round trip.
  - Confirmation pays the latency twice: the POST, and its CORS preflight.
- **The viewer figure is an estimate.** Sharing comes with M7. The estimate is the same-account propagation, plus TS-23's 250 ms debounce, plus a measured refetch of the largest shared collection (2,000 albums): 229 ms on desktop and 1,057 ms on mobile.
- **The heaviest interaction is the 5,000-album list on mobile,** at 128 ms against 200 ms. It is the one to watch when M2-09 adds grouping and real columns.
- **Limits.**
  - Devices and network are emulated on one machine, and API and database are local, so there is no host in the path yet.
  - Confirmation and propagation keep the most headroom, which is where a real host adds time.

## Running it again

```sh
bun run --cwd apps/web test:perf    # both profiles, about a minute; needs the local Postgres
```
