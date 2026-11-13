---
name: diagnose
description: Find the cause of a hard bug, flaky test or slowdown in Tonaris by first building a loop that fails on it, then testing ranked hypotheses one variable at a time. Use when asked to diagnose or debug something, when something is broken, throws, fails now and then, or got slow, and before lengthening a wait in a flaky test.
---

# Diagnose

Bugs here have hidden behind plausible stories. Two rounds of "flaky" browser tests (TON-102, TON-118) turned out to be product bugs: a job claim that leased several rows, a Web Lock freed late, and router scroll restoration copying offsets between views. Each was found by making the failure happen on demand, not by reading code. So this skill builds the failing loop first.

## 1. Build a loop that goes red

Find one command that fails on this bug, the exact symptom the creator or the test saw, and passes once it's fixed. Run it before going further, and show the command and its output.

Ways to get one, roughly in this order:

1. **A failing test at the closest seam:** a `bun test` file in the package, an integration test on a fresh schema of `tonaris_test` (`@tonaris/db/testing`), or a browser test.
2. **One browser test alone, looped:** from `apps/web`, run `bunx playwright test <file>:<line> --project=chromium` in a shell loop until it fails, then count how often. A full browser-suite run takes about 1.3 minutes. Only one suite runs at a time, because they share ports 3100 and 3101. Never use `--repeat-each` on tests that sign in as one shared account.
3. **The full suite in a loop**, when the failure only shows under load. Several tests failing on the same wait point to a shared cause, such as the job worker or a lock.
4. **A probe that dumps state on failure**, added for the hunt and removed afterwards: job rows, Web Locks (`navigator.locks.query()`), the IndexedDB outbox, a scroller's `scrollTop`, the SSE stream's last event ID. A probe that throws crashes the e2e API, and then every test fails, so check the first run's setup output.
5. **A comparison with `main`:** `git worktree add --detach <scratchpad>/main-base main`, run `bun install --frozen-lockfile` there, and run the same test on both trees. Then `git bisect run` with the loop, if the bug arrived between two commits.
6. **A script against the running API:** `bun dev`, sign in with a code from Mailpit, then `curl` or a `bun` script calling `/v1` with the session cookie.
7. **For slowness:** time the reference workload (`bun run seed:workload`, then sign in as `workload@tonaris.test`) with a plain timer or DevTools presets, one run each, and compare with `docs/performance-verification.md`.

For a failure that comes and goes, aim for a higher rate, not a clean repro: loop it, run tests in parallel, add load. At 50 % a bug can be debugged; at 1 % it can't.

If no loop can be built, stop and say what was tried. Ask the creator for what would let one exist.

**Done when** one command, already run, fails on this bug's exact symptom at a known rate.

## 2. Make it small

Cut steps, data and setup one at a time, rerunning the loop after each cut, until removing anything more makes it pass.

## 3. Rank hypotheses

Write 3 to 5 causes before testing any. Each predicts something checkable: "if X causes it, then changing Y makes it pass". Show the list to the creator when they're around, since they may know one is ruled out. Don't wait on them.

## 4. Test one variable at a time

Each probe tests one prediction. Tag debug logs with a unique prefix such as `[DEBUG-a4f2]`, so one `grep` finds them all for removal.

## 5. Fix with a regression test

Turn the small repro into a test at a seam where the bug really happens. Watch it fail, fix the code, watch it pass, and rerun the original loop. If no such seam exists, that is a finding in itself: say so in the PR.

## 6. Clean up

- The original loop passes. For a failure that came and went, it passes several times as many runs in a row as it used to take to fail. TON-118 used five full `bun run check` runs.
- No `[DEBUG-` tags left, and probes and worktrees removed.
- The PR or issue states the cause that turned out true, so the next person learns it.

*Adapted from Matt Pocock's `diagnosing-bugs` skill (MIT); see `../THIRD_PARTY_NOTICES.md`.*
