# Spec Delta

## MODIFIED Requirements

### Requirement: Keyboard shortcuts move around the workspace
The workspace SHALL offer DS-78's navigation shortcuts:
- G then H, U, T or S for the root, Unsorted, Trash or Settings → Preferences;
- `[` to hide or show the sidebar;
- `V` for the current view's View options;
- `?` for a reference of the shortcuts that work.

Shortcuts SHALL be off while a text field has focus. The reference SHALL also open from the account menu.

#### Scenario: Going to Unsorted
- **WHEN** an owner presses G then U
- **THEN** Unsorted opens

#### Scenario: Going to Settings
- **WHEN** an owner presses G then S
- **THEN** Settings → Preferences opens

#### Scenario: Shortcuts wait while typing
- **WHEN** an owner types "g u" into a name field
- **THEN** the text is typed and nothing else happens

### Requirement: The sidebar shows the collection as a tree
The sidebar SHALL show the owner's folders and lists as a tree, nested as saved, each level in its view's sort (FR-01.3, DS-27, DS-31; decided 23 October 2026). Below them it SHALL show Unsorted, Shared with me and Trash. Lists and Unsorted SHALL show their album counts. The current view's item SHALL be selected, and its ancestors expanded. Expanded folders SHALL be remembered on the device. Changes from any session SHALL appear without reloading.

#### Scenario: Nested folders and lists
- **WHEN** an owner has a folder 'Metal' holding a list 'Doom' with two albums, and opens 'Doom'
- **THEN** the tree shows 'Metal' expanded with 'Doom' inside it, selected, with the count 2

#### Scenario: Expansion is remembered
- **WHEN** an owner expands a folder and reloads the page
- **THEN** the folder is still expanded

#### Scenario: The tree follows the root's sort
- **WHEN** an owner sorts the root, holding the list 'Later' and the folder 'Metal', by Name
- **THEN** the tree shows 'Metal' before 'Later', as the root's view does

## ADDED Requirements

### Requirement: Settings has its own navigation
Settings pages SHALL share a subnav listing the settings pages that exist, in DS-92's order, with the current page marked (DS-92). The account menu's Settings item SHALL open Settings → Preferences.

#### Scenario: From Preferences to Connections
- **WHEN** an owner opens Settings from the account menu, then Connections in the subnav
- **THEN** Settings → Preferences opens first, then Settings → Connections, marked as the current page
