# Spec Delta

## ADDED Requirements

### Requirement: The sidebar shows what's shared with the person
Shared with me SHALL open in the sidebar's tree to each folder or list in it (FR-07.13), with its owner's display name, and a shared folder SHALL open to its folders and lists, following the owner's saves while open (FR-07.11). Each SHALL open the shared view, which the tree marks (TON-130).

#### Scenario: A shared folder in the tree
- **WHEN** Denis has shared the folder 'Metal', holding the list 'Thrash', with a person who opens 'Metal' in the sidebar
- **THEN** the tree shows 'Metal · Denis' under Shared with me, with 'Thrash' inside it, which opens the shared view
