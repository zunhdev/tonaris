# Spec Delta

## ADDED Requirements

### Requirement: A phone's top bar reaches any view above
On a phone, two or more levels below Collection, the top bar's name SHALL open a menu of the views above it, Collection first, then each folder down to the one Back goes to; choosing one SHALL go there. One level down, the name SHALL stay plain (DS-110, TON-153).

#### Scenario: Straight to Collection
- **WHEN** a person on a phone in a list inside a folder taps the list's name and chooses Collection
- **THEN** they are on the Collection screen

#### Scenario: One level down
- **WHEN** a person on a phone opens a folder at the top of their collection
- **THEN** its name is not a button
