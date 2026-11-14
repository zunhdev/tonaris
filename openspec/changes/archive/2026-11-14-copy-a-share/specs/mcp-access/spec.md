## ADDED Requirements

### Requirement: Agents copy a share after approval
A Manage connection SHALL copy a folder or list shared with the person into their collection only after the person approves it in Tonaris, with what the copy adds in the approval; a copy that can't be made or wouldn't fit SHALL fail before any approval is asked for (FR-07.22, FR-10.6).

#### Scenario: Approved
- **WHEN** an agent calls `copy_shared` for a share and the person approves
- **THEN** calling again with the approval copies it, as the app would
