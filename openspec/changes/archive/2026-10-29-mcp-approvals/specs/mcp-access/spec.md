# Spec Delta

## ADDED Requirements

### Requirement: Gated operations wait for the owner's approval of the exact scope
Deleting into Trash, removing chosen options, deleting a field and confirming an uncertain match SHALL need the owner's approval in Tonaris (FR-10.6). The agent SHALL get the summary, the consequences and a link to the approval page. Nothing SHALL change until the owner approves; a declined or expired approval SHALL change nothing. One approval MAY cover a defined batch, and permission alone SHALL never replace it.

#### Scenario: Asking
- **WHEN** an agent asks to delete two albums
- **THEN** it gets `needs_approval` with "Move 2 albums to Trash", the lists they leave, the 30 days in Trash and a link, and nothing is deleted

#### Scenario: Declined
- **WHEN** the owner declines, and the agent calls again with the approval
- **THEN** it is told the owner declined, and nothing changes

### Requirement: Tonaris verifies the approval itself, and it covers only its scope
An approved operation SHALL run only if the approval is this connection's, for this operation, approved, unused and unexpired within 30 minutes, and the scope computed again under the owner's lock still hashes the same (FR-10.6, TS-64). The approval SHALL be used in the same transaction as the change, once. A scope that grew or changed SHALL get a fresh approval. Sending the same change's key again SHALL replay it, and any other change SHALL find the approval used.

#### Scenario: A grown scope
- **WHEN** an approved album joins another list before the agent calls again
- **THEN** nothing is deleted, and the agent gets a new approval naming both lists

#### Scenario: A grown option removal
- **WHEN** the owner approved removing two options, and one more album chooses one of them before the agent calls again
- **THEN** nothing is removed, and the new approval counts both albums

#### Scenario: Once
- **WHEN** an approved deletion ran, and the agent makes a new call with the same approval
- **THEN** it is told the approval was used, and nothing more changes

### Requirement: Confirmations name sharing effects and what stays
A deletion's approval SHALL name what goes with each folder, the albums that go to Unsorted because they are in no other list, the lists each album leaves, who no longer sees it, and the recovery window (FR-07.14, X-07). A field's deletion or an option's removal SHALL name how many albums lose it, in Trash included, and that it can't be undone. A match SHALL say whether the link joins an album already in the collection.

#### Scenario: A shared folder
- **WHEN** an agent asks to delete a linked folder holding a list with an album in no other list
- **THEN** the approval says the album goes to Unsorted, that anyone with the link no longer sees it, and that everything can be recovered for 30 days

### Requirement: The owner finds and decides requests in the app, on any device
The approval page SHALL show the request's client, summary, every part of its scope, its consequences and its expiry, and SHALL work on a phone (DS-87, X-04). Only the owner SHALL see or decide it; another account SHALL be told it belongs to another account. Settings → Connections SHALL list the requests waiting for a decision, and the sidebar SHALL show Approvals with their count while any wait (DS-86).

#### Scenario: Waiting
- **WHEN** an agent asked to delete an album and the owner opens Settings → Connections
- **THEN** "Waiting for your approval (1)" lists "Move 1 album to Trash" with Review, and the sidebar shows Approvals with 1

#### Scenario: On a phone
- **WHEN** the owner opens the approval link on a phone-sized screen and approves
- **THEN** the page fits without scrolling sideways, says to return to the client, and the agent's next call deletes the album
