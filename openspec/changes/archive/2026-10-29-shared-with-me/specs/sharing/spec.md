# Spec Delta

## ADDED Requirements

### Requirement: Link shares are saved only on purpose
A signed-in person SHALL be able to add a link-shared folder or list to Shared with me from the link's page (FR-07.13, DS-68). Opening a link SHALL add nothing. Adding SHALL create no copy, use no slot, and reuse an existing reference; adding it again through a new link SHALL point the same reference at that link. Guests SHALL NOT be able to save references.

#### Scenario: Adding from the link
- **WHEN** a signed-in person opens a shared link and chooses Add to Shared with me
- **THEN** the banner reads "In Shared with me", and the collection is in their Shared with me

#### Scenario: Only opening
- **WHEN** a signed-in person opens a shared link and leaves
- **THEN** nothing is added to their Shared with me

### Requirement: References synchronize and can always be removed
References SHALL persist and synchronize across the person's devices (FR-07.13). A reference SHALL be removable at any time, even when its content is no longer accessible. Removing it SHALL revoke no grant and keep other access paths. References SHALL never grant access beyond current sharing; one that is no longer accessible SHALL say so.

#### Scenario: Another device
- **WHEN** a person adds a link to Shared with me on one device
- **THEN** their other signed-in device lists it without reloading

#### Scenario: No longer available
- **WHEN** the owner turns off the link a reference was saved through
- **THEN** Shared with me shows it dimmed as "No longer available", with Remove, which removes it

### Requirement: Shared with me lists references by owner
Shared with me SHALL group references by owner display name, marking those from invitations and those saved from links (DS-67). An invitation-based one SHALL offer Leave share…, confirming that the owner would have to invite again; a link-saved one SHALL offer Remove from Shared with me.

#### Scenario: Leaving from Shared with me
- **WHEN** a person chooses Leave share… on an invitation-based reference and confirms
- **THEN** it leaves Shared with me, and its owner would have to invite them again
