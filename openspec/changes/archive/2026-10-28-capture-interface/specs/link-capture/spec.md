## ADDED Requirements

### Requirement: Pasted links are captured where they are pasted
On desktop, an owner SHALL add albums by pasting Spotify, Apple Music, Qobuz or Tidal links anywhere in the workspace while no text field has focus (FR-02.1). Each pasted line that looks like a link SHALL become one capture. In a list, the albums SHALL go to that list; anywhere else they SHALL be saved without a list, into Unsorted, with adding to a list offered (FR-02.2). Pasting SHALL switch to Editing mode first, and SHALL wait while offline. Text with no link in it SHALL be ignored.

#### Scenario: Pasting in a list
- **WHEN** an owner viewing the list "Grunge" pastes a Spotify album link
- **THEN** the album is captured into "Grunge"

#### Scenario: Pasting elsewhere
- **WHEN** an owner viewing their collection's root pastes an Apple Music album link
- **THEN** the album is saved without a list, appears in Unsorted, and "Add to list…" is offered

#### Scenario: Several links at once
- **WHEN** an owner pastes three links on three lines
- **THEN** three captures start, reported together as one batch

#### Scenario: Typing in a field
- **WHEN** an owner pastes a link into a text field
- **THEN** the field gets the text, and nothing is captured

### Requirement: The capture dialog takes links and a destination
`C` and "+ Add album" SHALL open a dialog taking one link per line and an optional destination list, defaulting to the list on view, else none (FR-02.1, FR-02.2). It SHALL offer manual entry instead (FR-02.4).

#### Scenario: Capturing from the dialog
- **WHEN** an owner presses `C`, enters two links, chooses the list "Grunge" and adds them
- **THEN** both are captured into "Grunge"

#### Scenario: Entering manually instead
- **WHEN** an owner opens the capture dialog and chooses "Enter manually"
- **THEN** the manual entry form opens, going to the same destination

### Requirement: A capture shows its progress and its failure where it lands
While a capture runs, its destination view SHALL show it as a placeholder row with its link. A capture that fails SHALL keep its row with the reason, and offer Retry, Enter manually and Dismiss (FR-02.5). The pasted link SHALL be kept, across reloads, until the capture is saved or dismissed. A refusal at a limit SHALL be shown in the same place, with its reason (FR-15.3).

#### Scenario: Resolving
- **WHEN** a capture into "Grunge" is still running
- **THEN** "Grunge" shows a row for it reading "Resolving link…", and the owner can keep working meanwhile

#### Scenario: A failure keeps the link
- **WHEN** a capture fails because MusicBrainz can't be reached
- **THEN** its row explains that, offers Retry, Enter manually and Dismiss, and still shows the link after a reload

#### Scenario: Retry
- **WHEN** the owner retries a failed capture and the source answers
- **THEN** the album is saved, and the row becomes the album

#### Scenario: Unsupported input
- **WHEN** a pasted line isn't a link of the four services
- **THEN** its row says so, and offers manual entry

### Requirement: Manual entry continues a capture
Enter manually SHALL open the manual entry form prefilled with what is known: the pasted link and capture's values, if any (FR-02.4). When capture asked for the album's details (FR-02.3, FR-02.6), saving the form SHALL complete that capture, keeping the link and the sources of values left as offered. After a failure, saving SHALL add the album with the pasted link as its link for that service, when it is one.

#### Scenario: A Tidal track link
- **WHEN** a pasted Tidal track link asks for the album's details, and the owner enters them
- **THEN** the album is saved with the Tidal link

#### Scenario: Apple's hints offered
- **WHEN** an Apple Music link capture couldn't identify comes back with Apple's title, artist and year, and the owner saves them unchanged
- **THEN** the album is saved with those values and the link

#### Scenario: After a failure
- **WHEN** a Spotify link's capture failed and the owner enters the album manually from its row
- **THEN** the album is saved with that Spotify link, and the failed capture is gone

### Requirement: The person decides an uncertain match
A capture that fits several albums SHALL show their choices without applying anything (FR-02.9): each candidate by its title, marked when it is already in the collection, "None of these", and "Decide later". Choosing a candidate SHALL complete the capture as that album. "None of these" SHALL open manual entry, saving the album unidentified with the link. "Decide later" SHALL leave it pending while other items go on (FR-02.10).

#### Scenario: Choosing
- **WHEN** a capture fits "The Last in Line" and "Holy Diver", and the owner chooses "The Last in Line"
- **THEN** "The Last in Line" is saved into the destination

#### Scenario: Deciding later in a batch
- **WHEN** one of three pasted links fits two albums
- **THEN** the other two are saved, and the third waits under Needs you until decided or dismissed

### Requirement: Outcomes are reported plainly
A capture's outcome SHALL be reported as DS-48 says (FR-02.9, FR-01.7, FR-14.4, FR-06.4): an album already in the collection that was added to the list, an album already in the list, an album restored from Trash, and a link kept instead of the pasted one, with a way to review it. A kept link's alternative SHALL be offered in the album's inspector for explicit replacement.

#### Scenario: Already in the list
- **WHEN** an owner pastes a link to an album already in the list on view
- **THEN** "Already in this list" is shown, and nothing else changes

#### Scenario: A kept link
- **WHEN** a capture keeps the album's Spotify link instead of the pasted one
- **THEN** "Kept your existing Spotify link" is shown with Review, and the inspector offers to replace it with the pasted one

### Requirement: Batches report each item
A paste or dialog submission of more than one link SHALL show a progress panel with how many are done, need the person and failed, which opens the batch's report (FR-02.11, FR-13.4). Each item SHALL be sent on its own, so each settles as it finishes, and invalid items SHALL be reported with their reasons without holding up the others.

#### Scenario: A batch with a failure
- **WHEN** an owner pastes four links and one is unsupported
- **THEN** three albums are saved, the panel reads that one failed, and the report lists it with its reason

### Requirement: Captures don't hold up other edits
A capture SHALL be sent after the edits made before it, so a capture into a list just created finds the list. It SHALL NOT delay edits made after it: they are saved while it runs (TS-22). A capture whose answer is lost SHALL be resent until its outcome is known, and shall be saved at most once.

#### Scenario: Editing while a capture runs
- **WHEN** a capture is still running and the owner renames a list
- **THEN** the rename is saved without waiting for the capture

#### Scenario: Into a new list
- **WHEN** an owner creates the list "Doom" and at once pastes a link into it
- **THEN** the album is captured into "Doom"
