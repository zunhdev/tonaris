# Spec Delta

## ADDED Requirements

### Requirement: The YouTube Data API is read only as its terms allow
YouTube's pages SHALL never be read. A YouTube Music link's step 4 SHALL take at most three Data API reads to www.googleapis.com, with `YOUTUBE_API_KEY` sent in a header, and only for an owner who agreed to the current terms (TS-41, TS-105). Nothing from them SHALL be stored, cached or logged, and the key SHALL appear in no URL, log or error. Without the key, step 4 SHALL be skipped. A refused read SHALL send the link to manual entry; an unreachable API SHALL fail with `provider_unavailable`.

#### Scenario: No key
- **WHEN** `YOUTUBE_API_KEY` is unset and a YouTube Music link MusicBrainz doesn't know is pasted
- **THEN** no request goes to www.googleapis.com, and the answer asks for the album's details with the link kept

#### Scenario: A member who hasn't agreed
- **WHEN** a member who hasn't agreed to the current terms adds a YouTube Music link through an agent
- **THEN** no request goes to www.googleapis.com

#### Scenario: Quota used up
- **WHEN** the Data API answers 403 to a read
- **THEN** the link goes to manual entry, and the warning logged doesn't contain the key
