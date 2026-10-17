# Tonaris — requirements audit

Date: 13 October 2026. Followed by the [17 October 2026 audit](2026-10-17-requirements-audit.md), which restructured the requirements into iteration 6, added data export, and moved the feasibility gates into the requirements (section 8).

Reviewed the iteration-4 baseline; approved additions are incorporated in iteration 5 of [the requirements](../product-requirements.md) (then named `App requirements.md`).

## Assessment

The baseline is ready for feasibility work and design/technical planning, not yet an implementation-ready or release-ready specification. It is particularly strong on ownership, edition identity, custom-field lifecycle, selective sharing, Trash, concurrent edits, safe retries, and observable acceptance scenarios.

The personal-use purpose and substantial first-version scope are intentional. This audit does not propose commercial validation, remove required features, select technologies, or treat explicitly deferred design/technical choices as missing product decisions.

Provider-policy claims and external-client capabilities were not independently revalidated in this document audit. Referenced precedents do not establish access or permission for Tonaris. The name is adopted as requested; trademark/domain availability has not been checked.

## Decisions approved in this audit

| Gap | Approved decision | Updated requirements |
| --- | --- | --- |
| Product identity | Use **Tonaris** as the app name. | Document title and introduction |
| Capture required an implicit list destination | Allow desktop/manual/MCP saving without a list; new unlisted records appear in Unsorted. Reused records keep their existing memberships. | FR-02 |
| Sharing described list moves without explicitly requiring them | Support list moves between folders and root while preserving identity, content, direct shares, and personal preferences. | FR-01 |
| Unsorted presentation was unspecified | Support list-equivalent name/year/manual sorting and release-type grouping, with remembered synchronized preferences. | FR-05, FR-11 |
| Admission had rules but no creator workflow | Require creator-only desktop administration, email-bound single-use invitations, revocation, and admission pause/resume. | FR-11 |
| Deferred user exports could be mistaken for deferred operational protection | Require automated protected operator backups and tested disaster recovery; agree objectives, retention, and deletion treatment in technical planning. | Section 5 |
| Live sharing could unexpectedly expose personal fields or new descendants | Explain exposure before enabling sharing and show effective sharing in desktop moves/recovery, without adding approval to ordinary MCP operations. | FR-07 |
| Collection-root presentation was implicit | Use folder-equivalent sorting and personal arrangement with remembered, synchronized root preferences. Root itself is not shareable. | FR-05, FR-11 |
| Same-service link conflicts had no defined outcome | Keep one current link per service per edition. Preserve a populated link during capture/enrichment and report an alternative for explicit replacement; equivalent link variants are not conflicts. | FR-06 |
| Nested Trash operations had an ambiguous recovery unit | A hierarchy deleted together is one restore/purge unit. Separately deleted items retain their own units and original expiry dates, independent of later parent operations. | FR-01 |
| Mobile browsing/search language could imply guest search | Guest browsing uses navigation and temporary presentation controls. Global search requires sign-in; local guest-share search is not required in version one. | FR-12 |

Added corresponding acceptance checks. Security expectations now explicitly cover untrusted URLs/content/agent input and technical threat-model planning, consistent with the existing authentication and authorization requirements.

## Highest-priority feasibility gates

1. **Permitted metadata strategy (D3/D7).** Validate each launch service's actual access path, costs, regional behavior, permitted storage, attribution/artwork use, cross-service matching, and agent-visible data. Establish how field-level source provenance remains available where policy enforcement requires it, even after manual corrections or enrichment. Do not assume that editing a provider-derived field removes its restrictions. Bring incompatible requirements back for a product decision rather than bypassing terms or silently disabling a required service/MCP feature.
2. **Edition matching (D2/D3).** Test real examples: remasters, deluxe editions, reissues, compilations, regional variants, identical titles, and track links. Define evidence for confident matching and when confirmation is necessary; title/artist similarity alone is insufficient. Distinguish provider edition-release dates from original-release and live-recording years. Required chronology may need manual completion when providers lack it.
3. **MCP compatibility and confirmation (D7).** Test one server with Claude web, ChatGPT web, and Codex desktop. Verify authentication, permission revocation, remote transport, scoped approvals, batches, and app-only restrictions. Do not rely solely on an agent claiming that a user approved a destructive operation; choose a verifiable approval mechanism during technical planning.

Resolve these gates before committing to affected integration implementations. Unrelated core work can be planned independently without implying that the full first-version promise has been validated.

## Remaining decisions

The behavior questions raised in this audit have been answered and incorporated above. Provider investigation may still reveal conflicts requiring new product decisions. Other intentionally open decisions concern technical/design planning and acceptance measurements rather than unspecified collection workflows.

## Required planning outputs

- **Design:** navigation and key workflows; root/Unsorted/list presentation; initial defaults; sort ties and new-item/manual-position behavior; sharing disclosures; confirmation/conflict/error states; keyboard/touch alternatives; creator administration.
- **Technical specification:** stack and deployment; portable saved-state model; metadata provenance and provider policy enforcement; identity/matching; authorization and MCP approvals; concurrency/idempotency; live synchronization; safe URL fetching/rendering; secrets and abuse protection; email delivery and creator-role provisioning; admission expiry and account-recovery verification.
- **Operational plan:** creator-approved monthly budget and cost scenarios; quotas beyond album count, including shared content and guest traffic; monitoring and incident response; automated backups, restore drills, recovery objectives, and deletion/revocation reconciliation. Explicitly settle historical-backup deletion retention and disclosure before acceptance.
- **Verification plan:** measured performance targets and realistic 5,000-album/shared-content workloads; browser/OS/screen-reader matrix; provider/client compatibility tests; permission and adversarial-input tests; recovery and partially completed-operation checks.
- **Delivery plan:** increments referencing stable FR IDs, with explicit dependencies and exit checks. Incremental delivery is not permission to drop intended first-version capabilities.

Do not invent numeric targets or infrastructure budgets without estimates and creator approval. User-facing backup/import/export, native apps, playback, library synchronization, and recommendations remain deferred or excluded exactly as specified.
