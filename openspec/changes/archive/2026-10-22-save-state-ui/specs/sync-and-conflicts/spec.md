# Spec Delta

## ADDED Requirements

### Requirement: Unsaved edits show their save state
Each edit not yet saved SHALL show its state, as an icon combined with text (FR-09.3, FR-13.3, DS-80, DS-115):
- *pending*, once it has waited 300 ms;
- *unconfirmed*;
- *failed*;
- *conflict*.

A confirmed edit SHALL show no marker and raise no message. Pending edits SHALL never block further editing.

#### Scenario: A slow save
- **WHEN** an owner creates a list and the server takes a second to answer
- **THEN** the workspace shows that it is saving, and once the list is confirmed it shows no save state and no message

#### Scenario: A save without an answer
- **WHEN** an owner's edit is sent but its answer is lost
- **THEN** it is shown as waiting to confirm, never as saved, until it is reconciled

### Requirement: The workspace reports its connection
The workspace SHALL always show whether it is connected, reconnecting or offline (FR-09.3, PRD section 2.3, DS-81).
- **Offline:** the browser reports no network, or the change stream has been down for 15 s. The main view then shows a banner saying it shows what was last loaded.
- **Connected:** the indicator says "Saving…" for a save waiting 300 ms, and counts the changes waiting to confirm and those needing review.

#### Scenario: Going offline and back
- **WHEN** the browser loses its network and later gets it back
- **THEN** the workspace shows it is offline, with the banner, and once back it shows it is up to date, without the banner

#### Scenario: The server can't be reached
- **WHEN** the change stream drops while the browser still has a network
- **THEN** the workspace shows it is reconnecting, and after 15 s without the stream it shows it is offline

#### Scenario: Changes waiting to confirm
- **WHEN** an owner's two edits are sent without an answer while the stream is connected
- **THEN** the indicator says 2 changes are waiting to confirm

### Requirement: Activity lists every change not yet saved
Opening the sync indicator SHALL list each pending, unconfirmed, failed and conflicting change, with what it was, its state and its next step (FR-09.3, FR-13.2, DS-81). A failed or conflicting change SHALL stay listed, also across reloads of the same account, until the person retries, resolves or dismisses it.

#### Scenario: A failure waits in Activity
- **WHEN** an owner's edit fails, they close its message and reload the page
- **THEN** Activity still lists the failure with its reason, until they dismiss it

#### Scenario: Pending changes are listed
- **WHEN** an owner opens Activity while an edit is waiting to confirm
- **THEN** Activity lists it as waiting to confirm, with what it changes

### Requirement: A failed edit is reported until dealt with, and can be retried
A rejected edit SHALL raise a message naming what couldn't be saved and why, which stays until closed and offers Retry (FR-09.3, FR-13.1, FR-13.2, DS-80). Retry SHALL make the same change again, judged against the current saved values. It SHALL be listed as a new change until confirmed.

#### Scenario: Retrying after fixing the cause
- **WHEN** an owner's new list fails because its name is taken, and after renaming the other list they choose Retry
- **THEN** the message said which list couldn't be saved and why, and the retried list is saved

### Requirement: Conflicts are resolved by a deliberate choice
A conflicting edit SHALL raise a message that stays until closed and leads to a review (FR-09.4, DS-80). For each conflicting field, the review shows the current saved value beside the attempted one.
- **Keep current** SHALL discard the attempt.
- **Apply mine** SHALL save the attempt over the current value, as a new change judged against it.

Nothing SHALL be applied without that choice.

#### Scenario: Apply mine
- **WHEN** an owner renames a list that another session renamed meanwhile, opens the review and chooses Apply mine
- **THEN** the review showed the other session's name as current and theirs as attempted, and their name is saved

#### Scenario: Keep current
- **WHEN** an owner reviews such a conflict and chooses Keep current
- **THEN** the other session's name stays, and the conflict is no longer listed

#### Scenario: Reviewing after a reload
- **WHEN** an owner reloads the page before reviewing a conflict
- **THEN** Activity still offers the review, with both values

### Requirement: Changes from elsewhere are told apart from one's own
The client SHALL tell changes saved by another session, tab or agent from those this tab made (FR-09.1, DS-82). Views can then highlight a record changed elsewhere for 1.2 s with a fade, or with a static tint under reduced motion. This tab's own confirmed edits SHALL NOT count as changes from elsewhere.

#### Scenario: Another session's change
- **WHEN** another session renames a list while this tab is open
- **THEN** this tab reports the list as changed elsewhere

#### Scenario: One's own change
- **WHEN** this tab renames a list and the change is confirmed
- **THEN** the list is not reported as changed elsewhere

### Requirement: Save problems and going offline are announced
Failures, conflicts and going offline SHALL be announced to assistive technology assertively (Q-02, DS-83). Routine confirmed saves SHALL NOT be announced. Other features SHALL announce through the same polite and assertive regions.

#### Scenario: Going offline is announced
- **WHEN** the browser loses its network
- **THEN** an assertive announcement says the workspace is offline and changes can't be saved

#### Scenario: A failure is announced
- **WHEN** an owner's edit fails
- **THEN** the failure is announced assertively, while a confirmed edit is not announced at all
