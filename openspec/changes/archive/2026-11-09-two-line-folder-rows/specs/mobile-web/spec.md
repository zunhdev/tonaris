# Spec Delta

## ADDED Requirements

### Requirement: A phone's folder and list rows put the count under the name
On a phone, a folder or list row SHALL be 56 px, with its name across the full width and, on a second line under it, its count, then its description's first line (DS-110, DS-41, TON-184). A tap anywhere on the row SHALL open the folder or list, and the link SHALL be named by the folder's or list's name.

#### Scenario: A long name
- **WHEN** a person on a phone opens Collection, as rows, holding an empty folder with a long name
- **THEN** its row is 56 px, the name ends in an ellipsis at the row's right edge, and "0 folders and lists" shows under it

#### Scenario: A tap on the count
- **WHEN** a person on a phone taps a folder's count
- **THEN** the folder opens
