# Spec Delta

## ADDED Requirements

### Requirement: Search includes shared content
Search SHALL include content the person reads through accepted invitations and link-shared collections they saved to Shared with me, and nothing else of anyone else's (FR-12.3). Shared results SHALL be told apart from the person's own, name their owner, and show only locations the person can access, never a private ancestor's name. Results SHALL follow live changes, revocation, moves, Trash and recovery. The app and MCP SHALL find the same shared albums.

#### Scenario: A shared list found
- **WHEN** Anna, who accepted an invitation to Denis's folder "Metal", searches for "doom"
- **THEN** "Doom" appears under Shared with me, "Shared by Denis · Metal", and opening it shows it view-only

#### Scenario: A private ancestor
- **WHEN** "Metal" sits inside Denis's unshared folder "Private"
- **THEN** searching "private" finds nothing of Denis's, and no result's location names "Private"

#### Scenario: Access ends
- **WHEN** Denis revokes Anna's invitation
- **THEN** her next search finds nothing of "Metal"
