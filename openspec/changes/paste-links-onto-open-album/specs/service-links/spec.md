# Spec Delta

## ADDED Requirements

### Requirement: A paste with an album open sets its links
On desktop, with an album open in the inspector and no text field focused, an owner's paste SHALL set each pasted link as the album's link for that link's service, checked as a typed link is (FR-06.3, TON-160). A refused link, or two for one service, SHALL change nothing. It SHALL switch to Editing first, and SHALL say what it did, with Undo.

#### Scenario: Pasting a Tidal link
- **WHEN** an owner with "Bleach" open in the inspector pastes a Tidal album link
- **THEN** "Bleach" has that Tidal link, and no album is captured

#### Scenario: Pasting another Spotify link
- **WHEN** an owner pastes a Spotify album link onto an album with another Spotify link, then chooses Undo
- **THEN** the album has the pasted link, then its own again

#### Scenario: Pasting a playlist
- **WHEN** an owner pastes a Spotify playlist link onto an open album
- **THEN** it is refused with the reason link capture gives, and the album's links are unchanged
