# Tonaris repository rules for reviewers

The rules a change must follow, beyond what `bun run check` enforces. Each cites its source, so a finding can quote it. README.md and `docs/tech-spec.md` are the full sources; this list is what reviews most often need.

## Layering and data flow

- `packages/domain` holds every business rule: commands, queries, policies, schemas. Routes, MCP tools, jobs and the web app adapt it and hold no rules of their own (TS-02).
- The app, MCP and native clients reach the same commands through `apps/api`. A second implementation of a rule in the web app or an MCP tool is a parity bug (X-02).
- The web app reads and writes only through the API, with no server functions for data. SSR loaders call the API over `API_INTERNAL_URL` (TS-03).

## API contract

- Every resource is under `/v1`, and changes are additive only. A removal or a change of meaning needs `/v2` (TS-09).
- Mutations are inline `oneOf` variants of `POST /v1/mutations`. oasdiff reads any edit to an existing variant, even an added optional property or a changed description, as a removal. While testing is closed (the creator, 5 November 2026), widen the mutation in place and add a named entry to `apps/api/openapi/oasdiff-ignore.txt`. Remove spent entries.
- A `z.literal` in a response becomes a JSON-schema `const`, and widening it later breaks the contract. Use `z.enum([...])` for a value set that will grow.
- Routes that validate input declare `422: problemSchema`; signed-in routes declare `signedIn: true` and `401: problemSchema` (README, API contract).
- Every write carries a `mutationId` and is idempotent (TS-22).

## Data

- A schema change ships with its generated migration, whose SQL was read. A merged migration is never edited. Changes follow expand and contract, so a deploy never breaks the running version (TS-17).
- A JSON value in a raw `sql` template goes as `sql.param(value)`, cast to `jsonb` where needed, never as `JSON.stringify(value)`: since Drizzle 1.0 rc.5 the string arrives as a JSON string (TON-203).
- Job claims take one row with a scalar subquery, `id = (SELECT … LIMIT 1 FOR UPDATE SKIP LOCKED)`. With `IN (…)` the planner can lease several rows (TON-118).

## Sharing and privacy

- Editor, viewer and agent paths answer as if content outside the share doesn't exist: conflicts, "in use" IDs, approvals, previews and capture results included (X-01, FR-07.21, TON-193).
- An editor's capture never restores an album from the owner's Trash; it saves a new one.

## Web app

- Components use semantic tokens only, never primitives (DS-10). Controls are 24, 28 or 32 px (DS-15).
- The CSP forbids `style` attributes on server-rendered pages, inline scripts without the nonce, and `eval`. `packages/domain` imports Zod through `src/zod.ts` (TS-101).
- A navigation that changes only search params on the same view, such as opening the inspector with `?album=`, passes `resetScroll: false`. A new scroll container in a page carries a `pageScroll(...)` mark, at most one of each name per page (TON-118, TON-157).
- Copy follows DS-107 and is recorded in the design spec as built. It is never left as an open question.

## Tests

- A browser test waits for a dialog to leave the DOM before pressing the next global key, because Base UI keeps focus inside during its 200 ms exit. Measure layout with `expect.poll(() => locator.boundingBox())`.
- Never use `--repeat-each` on browser tests that sign in as one shared account.
- A flaky test has been a product bug more often than a slow machine. Look for the bug before lengthening a wait.

## Specs and delivery

- A Feature or Design issue has exactly one OpenSpec change with `x-linear: TON-<n>`, archived as the PR's last commit. Bug, Chore and Spike issues have none (TS-132).
- A MODIFIED requirement stays under 500 characters; add a new requirement rather than growing an old one.
- A changed product promise updates the PRD first, with a change-log entry, then the design and tech specs.
- A new workspace package that the web app imports needs its manifest copied in `apps/web/Dockerfile`.

## Code smells (judgment calls)

Fowler's baseline (*Refactoring*, chapter 3). Each is a heuristic, never a hard violation, and a documented repository rule overrides it.

- **Mysterious name:** a name that doesn't say what it does or holds. Rename it.
- **Duplicated code:** the same logic in two hunks or files. Extract it and call it from both.
- **Feature envy:** a function using another module's data more than its own. Move it to the data.
- **Data clumps:** the same few values always travel together. Make them one type.
- **Primitive obsession:** a string or number standing in for a domain concept. Give the concept its own type.
- **Repeated switches:** the same branching on the same type in several places. Use one map or one function both share.
- **Shotgun surgery:** one logical change forces edits across many files. Gather what changes together.
- **Divergent change:** one module edited for unrelated reasons. Split it.
- **Speculative generality:** parameters, hooks or layers for needs nobody has. Delete them.
- **Middle man:** a function that only passes calls on. Call the target directly.
