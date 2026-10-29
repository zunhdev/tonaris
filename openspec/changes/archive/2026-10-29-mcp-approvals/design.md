# Design

## Context

- **What G3 built:** an `approvals` table bound to the connection; an album-deletion scope hashed canonically; the owner's decision API and page; and `delete_albums`, whose stand-in trashed albums directly.
- **What TON-82 built:** every MCP write runs the app's envelopes through `mcpWriter()`, with derived IDs under an `idempotencyKey`.
- **The app's own confirmations** for removing a chosen option and deleting a field already hash their scopes (TS-14), and the commands take that `scopeHash`.

## Goals / Non-Goals

**Goals:** FR-10.6's four gated operations, verifiable approvals that commit with the change, the page for each, and the pending list with its badge.

**Non-Goals:**
- recovery (TON-84);
- rate limits (TON-85);
- elicitation, which the clients don't support (TS-60).

## Decisions

### 1. One scope shape, extended

`approvalScopeSchema` keeps G3's required `operation`, `albums` and `recoverableDays`, and adds optional parts: `containers`, `unsorted`, `sharing`, `field`, `options`, `checks`, `match`.
- The page and agents read every operation alike.
- `GET /v1/approvals/{id}` changes additively for oasdiff: the operation's const becomes an enum, and properties are added.
- `checks` embeds TS-14's scope hashes, so a field gaining an album changes the approval's hash without listing thousands of albums.

### 2. The approval is used in the transaction that makes the change

`writeApproved()` runs everything in one transaction:
1. it takes the owner's write lock;
2. it computes the scope again;
3. `useApproval()` marks the approval used only if it is approved, unexpired, this connection's, and still hashes the same;
4. the envelopes run by `executeMutation`, each as a savepoint.

Changes reach the streams only after the commit. Holding the owner's lock means no other write of theirs can grow the scope meanwhile (TS-20), so no row locks are needed.

### 3. Retries replay, a new change can't reuse

The approval records the batch that used it. The same `idempotencyKey` derives the same batch, so `useApproval()` accepts it again and the batch replays. A new change finds the approval used, and is told it expired.

### 4. The plan follows the approved scope

The envelopes come from the scope the owner approved, stored with the approval:
- the folders and lists named;
- the albums named;
- the options with their scope hashes.

The recomputed scope must hash the same before anything runs, so the stored scope is the current one.

### 5. Deletion's scope

`deletionTargets()` reads, under the owner's lock:
- the albums and the lists each leaves;
- the roots among the folders and lists, a container inside another named one going with it;
- what goes with each root;
- the albums whose only lists are deleted, which go to Unsorted;
- `deletionImpact()`: everyone who sees it through the deleted containers, their folders, or the lists the albums leave.

The consequences name how many people and links lose it, and the page names them.

### 6. Options: one approval when any is chosen

`remove_options` checks the options first. If none is chosen, it is an ordinary change (FR-10.4). If one becomes chosen meanwhile, its command answers `field_in_use`, and nothing of it changes. If any is chosen, the whole request needs one approval (FR-10.6: one approval may cover a clearly defined batch). It then runs with each option's scope hash.

### 7. Matches: the agent proposes, the owner approves

`confirm_match {link, releaseGroupId, listId?}` first runs the capture without a choice, to read the link's candidates as Tonaris knows them, so the owner sees Tonaris's title, not the agent's.
- **The scope** adds the saved album of that release group, if the owner has one, and the list.
- **On approval,** the capture runs with the choice, through the runner, right after the approval's transaction, since a capture asks providers before the lock (TS-22). The command uses the choice only if the link still offers it.
- **`add_albums`** drops `releaseGroupId`, so a match can't be confirmed without approval.
- **The page** shows the proposed album, not DS-48's full decision card. To pick another candidate, the owner declines and tells the agent. Recorded in DS-87.

### 8. Pending approvals in the app

`GET /v1/approvals` lists pending, unexpired approvals. Agents ask through MCP, which no stream of the web client carries, so a store polls:
- on load and on focus;
- every 30 seconds;
- after a decision.

Settings → Connections lists the requests with Review, and the sidebar's **Approvals** place shows the count while any wait, like Invitations.

## Risks / Trade-offs

- **[A match's approval is used just before its capture runs]** → The capture checks the choice again. If it fails unexpectedly, sending the same key replays under the same approval.
- **[Polling every 30 seconds]** → The request is cheap and indexed, and the agent also tells the owner where to approve.

## Migration Plan

One migration: `approvals.batch_id`, and the operation check widened.
