# Spec Delta

## ADDED Requirements

### Requirement: A batch's outcomes are reported together, by status
A batch made in the workspace SHALL be reported as one report in Activity (FR-13.4, DS-84). The report groups its items in this order: needs you, failed, skipped, unconfirmed, pending, completed. Each item SHALL show what it was, its reason, and its next action. The report's header SHALL be a summary sentence counting each status. While the batch runs, its report SHALL be listed with its items' current states.

#### Scenario: A batch that partly fails
- **WHEN** an owner creates, in one action, a folder whose name is taken, a list inside that folder, and two other lists
- **THEN** the two other lists are saved and stay, and the report reads "2 saved · 1 failed · 1 skipped"
- **AND** it lists the folder as failed, with the reason and Retry
- **AND** it lists the list inside it as skipped, waiting for the folder
- **AND** it lists the two lists as completed

#### Scenario: A batch still running
- **WHEN** an owner opens Activity while a batch of two edits waits for its answer
- **THEN** Activity shows one report with both edits as waiting to confirm, not two separate changes

### Requirement: A report closes by itself only when everything saved
When every item of a batch is confirmed, its report SHALL close by itself and its summary SHALL be announced politely (FR-13.3, DS-02, DS-83, decided 22 October 2026). When any item failed, was skipped, or needs the person, the report SHALL stay in Activity until dismissed. This holds across reloads of the same account, and the report keeps the items' inputs until then (FR-13.2).

#### Scenario: Everything saved
- **WHEN** a batch of two edits is confirmed
- **THEN** its report leaves Activity, no message is raised, and a polite announcement says 2 changes were saved

#### Scenario: A report survives a reload
- **WHEN** a batch partly fails and the owner reloads the page
- **THEN** Activity still shows the report with every group, and no message is raised again

#### Scenario: Dismissing a report
- **WHEN** the owner dismisses a report
- **THEN** it leaves Activity, also after a reload

### Requirement: A batch that doesn't fully save raises one message
A batch that settles with any item not saved SHALL raise one message, not one per item (FR-13.3, DS-108, decided 22 October 2026). The message says how many changes couldn't be saved, gives the summary sentence, and offers View report, which opens Activity at that report. It SHALL stay until closed, and closing it SHALL keep the report.

#### Scenario: One message for a partial batch
- **WHEN** a batch of four edits settles with one failed and one skipped
- **THEN** one message says 2 of 4 changes couldn't be saved, announced assertively, and View report opens the report

### Requirement: Retrying from a report keeps the report whole
Retry on a failed item SHALL make its change again, together with the items skipped because of it, as new changes judged against the current saved values (FR-13.4, FR-13.5). Retry all SHALL be offered when two or more items can be retried, and retry them all at once. The retried changes SHALL take the old items' place in the report. Completed items SHALL never be sent again.

#### Scenario: Retrying a failed prerequisite
- **WHEN** the folder in a partial batch failed because its name was taken, the owner renames the other folder or list, and chooses Retry on the folder
- **THEN** the folder and the list inside it are saved, the report reads "4 saved", and the lists saved the first time are not created twice

#### Scenario: Retry all
- **WHEN** two lists of a batch failed because their names were taken, the names are freed, and the owner chooses Retry all
- **THEN** both lists are saved, and the report reads "3 saved"

### Requirement: Edits in one action that build on each other declare it
When a batch from the workspace holds an edit to a record that an earlier item of the same batch creates, the edit SHALL depend on that item (FR-13.4, TS-25). Examples are a list inside a new folder, or an album added to a new list. If the earlier item doesn't succeed, the later one SHALL be skipped, naming it, rather than run against a record that doesn't exist.

#### Scenario: A list inside a folder that failed
- **WHEN** a batch creates a folder whose name is taken and a list inside it
- **THEN** the list is skipped because of the folder, and no list is created

### Requirement: Failures are explained plainly, with one way forward
Every failure the workspace shows SHALL name what failed and give a reason in plain, blameless words, with one way forward where one is known (FR-13.1, DS-107). When the server gives no explanation, the reason SHALL come from the failure's code. A name already taken SHALL be refused as "'{name}' already exists in {folder}. Choose another name.", or "at the top level" for the root.

#### Scenario: A name already taken
- **WHEN** an owner creates a list at the top level with the name of an existing list 'Later'
- **THEN** the reason reads "'Later' already exists at the top level. Choose another name."

#### Scenario: A failure without an explanation
- **WHEN** a change fails with a code and no explanation
- **THEN** the workspace shows that code's plain reason, never the code itself or "Error"

### Requirement: Toasts follow one set of rules
Toasts SHALL appear bottom-right, at most 3 at a time (DS-108, FR-13.3).
- **Information** SHALL close after 4 s, and **undo** after 8 s.
- **Failures, conflicts and anything needing a decision** SHALL stay until closed, and what they report SHALL also be in Activity.
- **Timers** SHALL pause on hover and focus, and F6 SHALL reach the toasts.

#### Scenario: Durations by kind
- **WHEN** the workspace raises an information toast, an undo toast and a failure toast
- **THEN** they close after 4 s and 8 s, and the failure stays until closed

## MODIFIED Requirements

### Requirement: Activity lists every change not yet saved
Opening the sync indicator SHALL list each pending, unconfirmed, failed and conflicting change, with what it was, its state and its next step (FR-09.3, FR-13.2, DS-81). Changes made together in one action SHALL be listed in their batch's report rather than one by one (DS-84). A failed or conflicting change SHALL stay listed, also across reloads of the same account, until the person retries, resolves or dismisses it.

#### Scenario: A failure waits in Activity
- **WHEN** an owner's edit fails, they close its message and reload the page
- **THEN** Activity still lists the failure with its reason, until they dismiss it

#### Scenario: Pending changes are listed
- **WHEN** an owner opens Activity while an edit is waiting to confirm
- **THEN** Activity lists it as waiting to confirm, with what it changes

### Requirement: A failed edit is reported until dealt with, and can be retried
A rejected edit made on its own SHALL raise a message naming what couldn't be saved and why, which stays until closed and offers Retry (FR-09.3, FR-13.1, FR-13.2, DS-80). An edit made in a batch SHALL be reported by its batch's message and report instead. Retry SHALL make the same change again, judged against the current saved values. It SHALL be listed as a new change until confirmed.

#### Scenario: Retrying after fixing the cause
- **WHEN** an owner's new list fails because its name is taken, and after renaming the other list they choose Retry
- **THEN** the message said which list couldn't be saved and why, and the retried list is saved

### Requirement: Save problems and going offline are announced
Failures, conflicts and going offline SHALL be announced to assistive technology assertively (Q-02, DS-83). A batch's summary SHALL be announced politely when all of it is saved. Routine confirmed saves made on their own SHALL NOT be announced. Other features SHALL announce through the same polite and assertive regions.

#### Scenario: Going offline is announced
- **WHEN** the browser loses its network
- **THEN** an assertive announcement says the workspace is offline and changes can't be saved

#### Scenario: A failure is announced
- **WHEN** an owner's edit fails
- **THEN** the failure is announced assertively, while a confirmed edit is not announced at all
