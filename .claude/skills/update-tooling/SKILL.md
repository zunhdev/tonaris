---
name: update-tooling
description: Upgrade the repository's runtimes and tool images (Bun in .bun-version, @types/bun and the Docker images; Node through mise; the Postgres and Mailpit images; Playwright's browsers) and keep every pin in step. Use when asked to update Bun, Node, mise, the Docker images or the development tools.
---

# Update tooling

Move the runtimes and images to their latest stable releases in one Chore PR, with every place that names a version in step. npm packages and GitHub Actions pins belong to the **update-packages** skill.

## Where each version lives

| Tool | Set in | Must match | Enforced by |
| --- | --- | --- | --- |
| Bun | `.bun-version` | `packageManager` in `package.json`; `oven/bun:<v>` and `<v>-slim` in `apps/api/Dockerfile` and `apps/web/Dockerfile`; `@types/bun` (same major.minor). CI (`setup-bun`) and mise read `.bun-version` itself. | `bun run check:workspace` |
| Node | `mise.toml` | `node-version` in the commented Tests job of `.github/workflows/ci.yml` | this skill |
| Postgres | `postgresMajorVersion` in `render.yaml` (the creator's host) | `postgres:<18.x>` in `images.yml` and the commented Tests job; DBngin on the creator's Mac | this skill |
| Mailpit | Homebrew on the creator's Mac | `axllent/mailpit:<v>` in `images.yml` and the commented Tests job | this skill |
| Playwright browsers | the `@playwright/test` version | `bunx playwright install chromium` after it changes | this skill |

Node runs Playwright's test runner and the OpenSpec CLI, so it needs 20.19 or later. Use the current Active LTS line. The creator's global mise config says `latest` for everything; the repository's `mise.toml` overrides it here, and mise asks to trust that file once after it changes (`mise trust`).

A new Postgres major is the creator's call, because it means upgrading the hosted database. Only propose it. Patch tags of the current major are routine.

## 1. Find the latest releases

- Bun: `gh api repos/oven-sh/bun/releases --jq '.[0:5][] | [.tag_name, .published_at[0:10]] | @tsv'`. Read the notes of every release since ours. Bun 1.4's rewrite shipped regressions, so wait 7 days after a release unless it fixes a security issue or a bug we hit. Check that the Docker tags exist: `curl -s -o /dev/null -w '%{http_code}' https://hub.docker.com/v2/repositories/oven/bun/tags/<v>-slim` answers 200.
- Node: `curl -s https://nodejs.org/dist/index.json | jq -r '[.[] | select(.lts != false)][0:3][] | [.version, .lts, .date] | @tsv'`.
- Postgres: `curl -s 'https://hub.docker.com/v2/repositories/library/postgres/tags?page_size=50&name=18.' | jq -r '.results[].name' | sort -V | tail -3`.
- Mailpit: `gh api repos/axllent/mailpit/releases/latest --jq .tag_name`.

**Done when** each tool has a target version, or a reason to stay.

## 2. Apply

On the branch of a Linear Chore (team TON, labels Chore and infra):

1. Write each target into every place in the table. Then `grep -rn '<old version>' --include='*.md' --include='*.yml' --include='*.yaml' --include='*.toml' --include=Dockerfile .` to catch any other mention.
2. `mise install`, then confirm that `bun --version` and `node --version` print the targets inside the repository.
3. `bun install`. A new Bun can rewrite `bun.lock`; commit it if it does.
4. `bun run format` twice, `bun run check`, then `bun run build`.

**Done when** check and build pass on the new versions.

## 3. Publish

Publish with the **publish-pr** skill. Docker isn't run locally (TS-06): the PR's Images workflow builds and smoke-tests both images whenever a Dockerfile changes, so name that as the check for the images, and wait for it before merging. The DBngin and Homebrew updates on the creator's Mac are theirs to do. Give them as one line each in the PR, not as steps.
