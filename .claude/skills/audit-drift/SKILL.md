---
name: audit-drift
description: Audit Tonaris for drift between its specs, architecture and code, plus code smells and mistakes that keep recurring. Record every finding in docs/audits/drift-ledger.md, and turn the creator's confirmed findings into Linear issues. Run only when the creator asks for a drift audit.
---

# Audit drift

Specs, architecture and code drift apart one reasonable change at a time. This audit measures the gap, asks the creator what to do about each finding, and records the answers. The next audit then builds on them and never asks the same question twice.

The ledger, `docs/audits/drift-ledger.md`, is the memory between runs. Every finding keeps its `DRIFT-NNN` ID forever.

## 1. Read the ledger

Note the last run's commit, the open findings, and every decision already taken (filed, fixed, accepted, not drift). An accepted or dropped finding comes back only if its evidence has changed.

## 2. Choose the scope

- **Changed since the last run:** `git log --oneline <last commit>..HEAD` and `git diff --stat <last commit>..HEAD`.
- **One full area:** the area in the ledger's Areas table read longest ago. The scope keeps rotating, so every area gets a full read over time.

The creator can name a scope instead, such as an area, a capability or a rule ID.

## 3. Run the mechanical sensors

- `bun run check:refs`: rule IDs, repository paths and `bun run` commands that point nowhere, and OpenSpec changes left unarchived. It is part of `bun run check`, so it should pass. If it fails, main is broken, and that is the first finding.
- In scope: `TODO`, `FIXME` and `HACK` comments, and files over 600 lines, as hints for the readers below.

## 4. Run the three readers in parallel

Start three Agent calls in one message (`general-purpose`, fresh context). Give each the scope, the list of open and decided findings (so known ones aren't reported again), and its brief. Each returns at most 10 findings. Each finding gets a title, kind, evidence (`file:line` on both sides of the gap), why it matters (a concrete failure or cost), a size (S, M or L), and a proposed action.

- **Spec drift:** "Compare the code in scope with what `docs/product-requirements.md`, `docs/design-spec.md`, `docs/tech-spec.md` and `openspec/specs/` say about it. Report promises the code doesn't keep; behavior no spec records; 'as built' notes that are no longer true; and decisions the code contradicts, such as a TS- rule saying one thing while the code does another. Quote both sides."
- **Architecture drift:** "Check the code in scope against the layering in TS-02 and TS-03, beyond what lint enforces: business rules in routes, MCP tools, jobs or the web app; a rule implemented twice (X-02 parity); modules whose interface is as complex as their implementation (deleting them would move complexity, not concentrate it); and seams that leak. Use `.claude/skills/review-pr/repo-rules.md` as the rule list."
- **Smells and repeated mistakes:** "In scope, look for the code smells at the end of `.claude/skills/review-pr/repo-rules.md`. Then read the last 40 commits whose titles start with `fix:`, and the fix commits inside feature PRs. Group the mistakes into classes. A class that happened twice and that nothing prevents is a finding. Propose the strongest guard that works, in this order: a change in structure so the mistake can't be written; a type; a lint or check whose message names the fix; a test; a written rule, last."

**Done when** all three have answered.

## 5. Verify

Check every finding yourself. Open both sides of the evidence. Drop what doesn't hold. A finding the ledger already has updates that row's "Last seen" and isn't asked again.

## 6. Ask the creator

Show the new findings as one numbered table: ID, kind, finding, evidence, size, recommendation. Then decide them with AskUserQuestion, recommended option first:

- Up to 8 findings: one question per finding, with the options **File a Linear issue**, **Fix in this audit's PR** (only for small, safe fixes), **Accept as is** (ask for the reason in the same question's notes) and **Not drift**.
- More than 8: first ask whether to take every recommendation, or to go through them one by one.

## 7. Act

- **File:** first look for a matching issue (`list_issues` with a query). Otherwise create one in team TON: label Chore, or Bug when behavior is wrong, plus an area label (web, api, docs, infra); no project unless one fits. Write a readable description citing the `DRIFT` ID, with the evidence under a collapsible `+++ Agent notes` section.
- **Fix:** make the small fixes in the audit's own PR.
- **Accept** and **Not drift:** record the reason in the ledger.

## 8. Record

Update the ledger: a row in Runs (date, commit, scope, counts), each finding's row and state (`open`, `filed TON-n`, `fixed (TON-n)`, `accepted: <reason>`, `not drift: <reason>`), and the full area's "Last full read". Commit it on the branch of a Linear Chore, "Drift audit, <date>", and publish with the **publish-pr** skill.

*Draws on pstack's `correct`, Matt Pocock's `improve-codebase-architecture`, Anthony Fu's `antfu-issue-triage` and HumanLayer's `design-control-loop` (MIT); see `../THIRD_PARTY_NOTICES.md`.*
