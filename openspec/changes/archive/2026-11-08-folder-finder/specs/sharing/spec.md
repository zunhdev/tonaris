# Spec Delta

## ADDED Requirements

### Requirement: A destination's preview doesn't move the places above it
In "Move to…" and the restore prompt, the sharing preview SHALL keep room for two lines, and the dialog SHALL keep its top edge while open, so a change of preview, or of the folders found, never moves the field or the folders under the pointer (DS-69, TON-183).

#### Scenario: Pointing at another folder
- **WHEN** the preview for "Collection" reads "Sharing unchanged" and the owner points at "Metal", whose preview takes two lines
- **THEN** the dialog's top, the field and the folders stay where they were
