---
name: review-pr
description: Review a pull request or the current branch on three separate axes (does it do what its spec asks, does it follow the repository's rules, is it correct and safe beyond the diff), using reviewers with fresh context. Every finding comes with file:line evidence. Use when asked to review a PR, a branch or changes, and before merging a PR.
---

# Review a PR

Find what is wrong with a change before it merges. The author is usually an agent in this repository, often this same session, so reviewers start from fresh context and get the change and its spec, never the author's account of it.

There are three axes, reported separately so one can't hide another: code can follow every rule and still build the wrong thing.

## 1. Pin the change

- A PR: `gh pr view <n> --json number,title,body,headRefName,baseRefName` and `gh pr diff <n>`. To run anything against it, check it out in a worktree in the scratchpad: `git fetch origin <branch>`, then `git worktree add <scratchpad>/review-<n> FETCH_HEAD` and `bun install --frozen-lockfile` there.
- A branch: `git diff main...HEAD` and `git log --oneline main..HEAD`.

Stop if the diff is empty or the ref doesn't resolve.

## 2. Find the spec

In this order, collect what the change is supposed to do:

1. The Linear issue from `Closes TON-<n>`, with its description and comments (Linear's `get_issue` and `list_comments`).
2. The OpenSpec change in the diff (`openspec/changes/…` or its archive): proposal, design, tasks and spec deltas.
3. The rule IDs cited in the issue, the PR and the change (`FR-`, `DS-`, `TS-`, `X-`, `Q-`, `AC-`), read in `docs/`.

With no spec at all, the Spec axis reports "no spec" and the other two still run.

## 3. Run the three reviewers in parallel

Start three Agent calls in one message (`general-purpose`). Give each the diff command, the commit list, the spec sources from step 2 as paths or text, and its brief. Each answers in under 400 words. Each finding gets a `file:line`, what goes wrong, a concrete scenario, and how far it was proven: **said**, **pointed** (a real `file:line`), **walked** (step by step), or **ran** (a command and its output).

- **Spec:** "Report what the spec asks that the diff misses or only half does; what the diff does that nobody asked for; and what looks implemented but behaves differently from the spec. Quote the spec line for each. Also check the docs: the design or tech spec should record what was built ('as built in TON-n'), and a changed product promise must change the PRD first, with a change-log entry."
- **Standards:** "Check the diff against `.claude/skills/review-pr/repo-rules.md` and the code smells listed at its end. A broken repository rule can be a hard finding; a smell is always a judgment call, so label it 'possible <smell>'. Skip whatever oxlint, oxfmt, tsc or `bun run check` already enforces."
- **Correctness and blast radius:** "Find bugs in the changed code, and what the change breaks outside the diff: other callers, the sync stream and mutation contract, MCP tools sharing the command, the web store, migrations meeting existing data, the OpenAPI contract, the server-rendered pages under the CSP. Editor, viewer and agent paths must reveal nothing outside a share (X-01, FR-07). Find the one fact the change is safe because of, and prove it by running real code (a `bun test` file, a script). If you can't, say 'unproven'. Keep any repro in the scratchpad, not in the repository."

**Done when** all three have answered.

## 4. Verify

Check every finding yourself. Open the line, and rerun the proof if there is one. Drop what doesn't hold. Merge findings that share a cause. Don't rerank across axes.

## 5. Report

Three sections, Spec, Standards and Correctness, each listing its verified findings, worst first. End with one line: findings per axis, and the worst within each.

Post to the PR only when asked: `gh pr review <n> --comment --body-file <file>`. GitHub won't let an account request changes on its own PR, so always comment. Fix only when asked. Then run `bun run check` again and push.

*Adapted from Matt Pocock's `code-review` and pstack's `blast-radius` and `interrogate` (MIT); see `../THIRD_PARTY_NOTICES.md`.*
