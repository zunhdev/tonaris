# Tonaris — requirements audit, 17 October 2026

Reviewed iteration 5 of the requirements (formerly `App requirements.md`) and produced iteration 6, now [`docs/product-requirements.md`](../product-requirements.md). The audit also checked the proposed stack and the music-provider APIs against current sources. The stack critique is in the [tech spec](../tech-spec.md).

## Verdict

Iteration 5 was a thorough behavioral baseline: permissions, Trash, sharing, and failure semantics were unusually well specified. The problem was its **form**, not its content:

- **Size.** At 146 KB (about 43k tokens), an AI agent needs a large share of its context just to load it, and people can't scan it.
- **Repetition.** The same rules were restated in up to six places. Adding the export feature touched 14 separate passages, so every change risked leaving the copies inconsistent.
- **Coarse IDs.** FR-01 alone held 17 "Required" paragraphs under one ID, which is too coarse for Linear issues or OpenSpec changes to reference.

Iteration 6 keeps every agreed behavior, adds data export, and fixes the form. The largest new risk comes from evidence rather than from the document: **current provider terms conflict with core features as specified** (G1, below). The creator needs to decide on this before capture work starts.

## Structural changes

| Change | Detail |
| --- | --- |
| Rename and move | `App requirements.md` → `docs/product-requirements.md`; `Audit.md` → `docs/audits/2026-10-13-requirements-audit.md`. Kebab-case names without spaces give clean Markdown links, shell paths, and OpenSpec `context` links. Product, design, and tech specs now sit together in `docs/`. |
| Cross-cutting rules | Ten X-rules replace repeated boilerplate. Iteration 5 had 25 "belongs in the design specification", 26 "belongs in technical planning", 22 "app and MCP" parity statements, 18 "under FR-13" pointers, and 11 "Read-only agents cannot" clauses. |
| Granular, stable IDs | 144 rules (`FR-NN.M`), 10 quality requirements (`Q-`), 46 acceptance checks (`AC-`), and 3 feasibility gates (`G1`–`G3`, previously only in the 13 October audit). D1–D8 are kept for continuity. |
| Consolidation | One exclusions table (section 2.6). Capacity moved from section 2 into a new FR-15. The decision table is reduced to remaining work only. |
| Size | 146 KB → about 92 KB (−37%), despite adding the export feature, IDs, and tables. |
| Verification | An independent line-by-line comparison against iteration 5 found no high-severity losses. It found 10 smaller gaps, all fixed (below). |

## Decisions made with the creator (two rounds, 17 October 2026)

| Decision | Result | Rules |
| --- | --- | --- |
| Data export | First-version feature. One ZIP containing a versioned structured data file, a Markdown rendering, and a README. Includes Trash (marked) and personal arrangements and choices. Excludes account profile, sharing configuration, Shared with me references, credentials, and artwork files. Import and restore are **not planned**, and neither are viewer exports. | FR-08, FR-11.10, AC-41 |
| List-name search | List names are now matched; iteration 5 matched folder names but not list names. | FR-12.4, AC-25 |
| Mobile rearranging | Desktop-only. Mobile shows the saved order and offers sort, direction, and grouping. | §2.2, FR-05.2 |
| Theme | Dark only for v1, with tokens ready for a light theme. | Q-10 |
| Tech (recorded in the tech spec) | postgres.js driver now, Bun.SQL later. | — |
| Separate API service | Elysia runs as its own deployed API (`api.` subdomain, versioned `/v1`, OpenAPI contract) so future native apps can use it. It is not mounted inside TanStack Start. | §2.2; tech spec TS-01, TS-08, TS-09 |
| Metadata experiment (G1) | MusicBrainz is the canonical source. A pasted link is identified through MusicBrainz lookups, Spotify's API for identifiers only (nothing stored), and Apple's public lookup as hints for a strict automatic MusicBrainz match; otherwise manual entry. Interactive catalog search was declined. | FR-02.1, FR-06.7, G1; TS-41 |
| Classification source | Initial release type follows MusicBrainz, not the importing service. | FR-02.8, FR-05.9 |
| Singles | Unclassified. | FR-05.9; TS-45 |
| Hosting and budget | Creator-owned. The specs list platform requirements only; no cost plan and no staging for now. | FR-15.5; tech spec section 13 |
| Performance targets | Provisional, confirmed after the M1 spike. | Q-01; TS-120 |
| Resource limits | Approved as proposed. | FR-15.4; TS-18 |
| Test matrix | Approved as proposed. | Q-03; TS-122 |
| Admission invitations | Expire after 14 days. | FR-11.6; TS-71 |
| Account recovery | Decided by the creator's judgment. A help page shows a contact address, and the creator performs the change from Admin, audit-logged. | FR-11.5; TS-73, DS-93, DS-100 |
| Email provider | Chosen before the first real invitation (Mailpit in development). | TS-72 |
| Design | All nine design questions resolved: violet-indigo accent; Rows and Grid in v1; field columns after v1; chronological default sort; approvals usable on mobile; text-only link previews for now; text wordmark; typed sign-in email to confirm deletion. | Design spec section 17, X-04 |

## Clarifications and gap fixes

These make no intended behavior change; each is recorded in the change log.

- Container names cannot be blank (X-06).
- Single-list deletion feedback is a design decision; folder deletion stays confirmed (FR-01.11).
- Removing an unused option is an ordinary change in the app, as it already was through MCP (FR-03.17).
- Manage collection agents may change personal presentation, not only manual order (FR-10.4).
- Gaps found by the verification pass:
  - App and MCP search parity is now a rule (FR-12.1, X-02), not only an acceptance check.
  - Mobile browsing must be usable on small touch screens (Q-03).
  - A forwarded page URL grants no access without link sharing (FR-07.1).
  - Artwork storage and provider calls are bounded (FR-15.4).
  - Global search requires sign-in, and guest-share search is "not required" rather than banned (FR-12.1, AC-26).
  - Ownership is "initially" single (X-01).
  - A display name is optional at account creation (FR-11.3).
  - The accessibility outcomes and the no-scope-change rule are restored (Q-02).
  - Batches never expand the requested scope (FR-13.4).

## Findings and their status

### 1. Provider terms conflict with capture, MCP, and export (G1). Highest priority.

Research on 17 October 2026, with sources in the tech spec:

- **Spotify.**
  - The terms prohibit:
    - ingesting Spotify Content into AI models (Policy III.14);
    - building databases of Spotify Content or storing it indefinitely (Terms IV.3);
    - transferring it to third parties (Terms IV.2(e), Policy III.9);
    - integrating it with another service's content (Policy III.5).
  - Development mode requires the app owner to have Premium and is capped at 5 users. Extended quota needs an organization with at least 250k monthly active users.
  - `label` was removed from album responses, and the UPC was restored in March 2026.
  - Client-credentials catalog calls may now also require Premium (unverified).
- **Apple Music.** Developer agreement §3.3.6(D) limits MusicKit to facilitating users' Apple Music subscriptions. Album art and text may not be used apart from playback or playlist management.
- **Qobuz.** There is no developer portal or key issuance. The only practical API route is unofficial app IDs, which breaks Qobuz's terms.
- **Odesli/song.link.** The public API was retired on 31 July 2026.

**Impact.** As written, FR-02.1 says metadata "is populated automatically" from all three services, and FR-10 and FR-08 expose that data to agents and exports. Built directly on provider APIs, those three features would likely breach Spotify's and Apple's terms.

**Proposed strategy** (details in the tech spec; legal review advised):

- Parse pasted links locally to identify the service and release.
- Use **MusicBrainz** (core data is CC0) and the Cover Art Archive as the canonical source for stored metadata. MusicBrainz is also stronger on chronology: first-release dates, live secondary types, and recording relationships.
- Use provider APIs only where their terms allow, and only to identify the release.
- Store per-field provenance so any outcome can be enforced.
- Keep manual entry as the always-available fallback.

**Status:** the experiment direction is set (see the decisions above). The final decision follows the M1 spike, which measures coverage per identification step on the creator's real albums, and a legal review of Spotify API use and Apple's lookup terms.

### 2. Singles have no product category

Spotify's `album_type` is album, single, or compilation, with no EP. Apple has `isSingle` and `isCompilation`. The product's groups are Album, EP, Live, Compilation, and Unclassified (FR-05.7). Saving a single is plausible, but its group is undefined. **Options:**

- leave singles Unclassified, so no type is invented (FR-05.9);
- add a Single group;
- treat singles as EP.

**Decided:** Unclassified (FR-05.9).

### 3. Complexity hotspots

These are worth knowing when planning; none is proposed for removal.

| Area | Why it is expensive | Planning advice |
| --- | --- | --- |
| Conflict review (FR-09.4) | Needs versioned compare-and-set on every write, plus an interface showing current and attempted values. | Field-level compare-and-set keeps real conflicts rare. Design a single compact conflict view and reuse it everywhere. |
| Trash units and recovery prompts (FR-01.13–FR-01.16, FR-14.3) | Destination prompts, collisions, skipped memberships, same-edition guard, and sharing previews. | Give it its own milestone and build a test-scenario matrix from AC-27–AC-31. |
| Per-person arrangements for viewers and guests (FR-05.2) | Ordering data per person per container, including other owners' content. | Store fractional keys per person and container; guests stay in memory only. |
| Viewing and editing modes (FR-04) | Sits awkwardly with Linear's modeless feel. | The design spec proposes a lightweight toggle. Revisit after real use. |
| Three MCP clients (FR-10.1, G3) | Clients are mid-transition between MCP spec versions, and Claude.ai and ChatGPT web lack elicitation. | Out-of-band approval pages (tech spec); spike early. |

### 4. Remaining pending items

- Confirmation of the provisional performance targets after M1 (Q-01).
- Backup objectives and historical-backup deletion wording (Q-04). These belong with the creator's hosting decisions.
- The final G1 decision and the G2 matching evidence, both after the M1 spikes.

## Planning outputs status

| Output | Status |
| --- | --- |
| Design spec | Draft v0.1, [`docs/design-spec.md`](../design-spec.md) |
| Tech spec, including stack critique, hosting, sync protocol, provider strategy, and verification | Draft v0.1, [`docs/tech-spec.md`](../tech-spec.md) |
| Delivery plan | Proposed milestones and Linear/OpenSpec conventions in the tech spec; not yet created in Linear |
| Feasibility spikes for G1–G3 | Defined in the tech spec; first planned work |
