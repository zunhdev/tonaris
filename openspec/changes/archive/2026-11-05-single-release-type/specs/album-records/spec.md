# Spec Delta

## MODIFIED Requirements

### Requirement: Classification follows MusicBrainz's types
Enrichment SHALL classify an album from its release group's types (FR-02.8, FR-05.9, TS-45). Album, EP and Single map to themselves; Broadcast and Other are Unclassified, whatever their secondary types (decided 24 October 2026; Single on 5 November 2026, TON-164). For an Album, an EP, a Single, or a release group with no primary type, the secondary type Compilation SHALL make it a compilation and Live SHALL make it live. Unknown types SHALL stay unknown.

#### Scenario: A live compilation
- **WHEN** an album is enriched from a release group typed Album, with the secondary types Compilation and Live
- **THEN** it is a live compilation, so it groups as Live

#### Scenario: A single
- **WHEN** an album is enriched from a release group typed Single, with no secondary type
- **THEN** it is a Single and not live

#### Scenario: A live single
- **WHEN** an album is enriched from a release group typed Single, with the secondary type Live
- **THEN** it is a live Single, so it groups as Live

#### Scenario: No types
- **WHEN** an album is enriched from a release group with no primary or secondary type
- **THEN** its release type and whether it is live stay unknown

## ADDED Requirements

### Requirement: Single is a release type
An album's release type SHALL be Album, EP, Single, Compilation or unknown (FR-02.8, TON-164). Owners SHALL choose Single in the inspector and the manual entry form, agents SHALL set it, and exports SHALL carry it as `single`, as for EP. Albums saved as singles before TON-164 SHALL keep no type until someone sets one.

#### Scenario: Choosing Single in the inspector
- **WHEN** an owner in Editing mode sets an album's release type to Single
- **THEN** the album is a Single, in every list and session

#### Scenario: An agent sets Single
- **WHEN** an agent updates an album's release type to `single`
- **THEN** the album is a Single

#### Scenario: A single saved earlier
- **WHEN** an album was saved from a single before TON-164, with no release type
- **THEN** it keeps no type and groups as Unclassified until someone sets one
