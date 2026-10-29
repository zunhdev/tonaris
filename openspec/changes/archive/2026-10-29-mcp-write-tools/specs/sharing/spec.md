# Spec Delta

## ADDED Requirements

### Requirement: Manage collection agents keep and drop references
A Manage collection agent SHALL be able to add a link-shared folder or list to the person's Shared with me from the link, and to remove a reference, as the person can in the app (FR-07.13, FR-10.4). A Read-only agent and a guest SHALL NOT change references (AC-24). Leaving, accepting and declining invitations SHALL stay in the app (X-03).

#### Scenario: Saving through an agent
- **WHEN** the person gives their Manage agent a share link to "Epic", and it saves it
- **THEN** "Epic" is in their Shared with me, from the link

#### Scenario: A Read-only agent
- **WHEN** a Read-only agent tries to save a share link
- **THEN** it is refused, and Shared with me is unchanged
