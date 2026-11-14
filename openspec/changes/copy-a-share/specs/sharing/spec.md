## ADDED Requirements

### Requirement: A share can be copied into one's own collection
Anyone who can open a shared folder or list SHALL be able to copy it, with what is inside, into their collection under a folder of theirs or at the top level. Albums they have by release group or service link SHALL join the copied lists without being duplicated; custom fields SHALL map by name and type, created when missing. Over a limit, nothing SHALL be copied, and the share SHALL stay in Shared with me (FR-07.22).

#### Scenario: Copying a folder
- **WHEN** Anna copies Denis's shared folder "Metal", holding "Doom" with 2 albums, one of which she has by its link
- **THEN** her collection has "Metal" with "Doom", her album in it and one new album, and "Metal" stays in her Shared with me

#### Scenario: Over a limit
- **WHEN** the copy would create a custom field and Anna has 50
- **THEN** nothing is copied, and she is told which limit and by how much
