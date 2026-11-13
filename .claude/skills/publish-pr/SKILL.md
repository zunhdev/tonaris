---
name: publish-pr
description: Run the pre-push checks, push the branch and open its pull request with a short, plain description that passes `bun run pr:budget` (80 words for a Bug, Chore or Spike, 120 for a Feature or Design). Use when asked to open, create or publish a PR, and at the end of implementing a Linear issue.
---

# Publish a PR

A reviewer should understand the PR in under a minute: what changes for the person using Tonaris, why, and how it was checked. Everything else lives in the Linear issue, the OpenSpec change or the docs. The creator set the budget on 13 November 2026 (TON-202).

## 1. Gather

- The Linear issue: its key is in the branch name (`zunh/ton-<n>-…`). Read its type label (Bug, Chore, Spike, Feature or Design), its title and its rule IDs.
- `git log --oneline main..HEAD` and `git diff --stat main...HEAD`.

## 2. Check before pushing

CI doesn't run the tests (they're too costly on the free plan), so the local run is the gate.

1. `bun run format` twice. oxfmt doesn't always finish in one pass.
2. `bun run check`: format, lint, types, workspace and reference checks, specs, migrations, OpenAPI, unit and browser tests. It needs the local Postgres and Mailpit.
3. `bun run build`, when `apps/` or `packages/` changed. A new workspace package that the web app imports also needs a line in `apps/web/Dockerfile`.
4. Feature and Design issues: the OpenSpec change is archived as the PR's last commit (`/opsx:archive`). Then run `bun run check:specs >/dev/null 2>&1 && echo OK || echo FAIL` with the exit code visible. Bug, Chore and Spike issues have no OpenSpec change.

**Done when** all of them pass. Report a failure; never push past one.

## 3. Write the title

A Conventional Commit in plain words about what changes for the person, with the issue key: `fix: an editor's agent can delete inside a share (TON-200)`. Lowercase type, no period, at most about 80 characters. The squash merge makes it the commit message on `main`.

## 4. Write the body

Write it to a file in the scratchpad, in this shape:

```markdown
Closes TON-<n>

<One or two sentences: what changes for the person, and why. Cite the main rule ID if there is one.>

- <What a reviewer needs to know, 2 to 4 bullets at most>

Verified: <what ran and what it showed, in one line>.
Not verified: <what nobody checked, such as by hand in the app, or "nothing beyond the above">.

OpenSpec change: `<name>`, archived in this PR.   (or: OpenSpec change: none (<Type>).)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

What earns a place:
- The behavior first, then the approach only where a reviewer would otherwise ask why.
- A file or symbol only when the reviewer must open it.
- Numbers instead of adjectives: "slowest keystroke 6 ms", not "fast".
- Tests as one line ("new browser tests cover moving and deleting inside a share"), never test by test.
- Write in plain words (the **plain-writing** skill): no headings, no em dashes, no "This PR".

What goes elsewhere: decisions and their reasons go in the Linear issue; detail for agents goes under its Agent notes; behavior as built goes in the docs. Copy wording isn't an open item; the creator reviews all copy in the running product.

## 5. Count

`bun run pr:budget <file> --type <bug|chore|spike|feature|design>`. It counts the prose without the `Closes` line, the OpenSpec line and the footer. It fails over the budget, without a `Closes TON-n` line, or on an em dash, and warns about headings and filler.

When it fails, cut whole points and keep sentences whole. Fragments and arrows are not the fix.

**Done when** it passes and its warnings are dealt with.

## 6. Push and open

```sh
git push -u origin HEAD
gh pr create --base main --title "<title>" --body-file <file>
```

Give the creator the PR's URL. Merging is a separate step: merge only when the creator's request says to.

*Adapted from Anthony Fu's `antfu-create-pr` (MIT); see `../THIRD_PARTY_NOTICES.md`.*
