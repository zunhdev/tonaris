# Spec Delta

## ADDED Requirements

### Requirement: Recipients can leave an invitation-based share
A recipient SHALL be able to leave a share they accepted by invitation (FR-07.7). Leaving SHALL withdraw that grant, with the descendant access through it, and remove the reference that came only from it. Other grants and saved link references SHALL remain, and the owner's content and other viewers SHALL be unaffected. A later invitation SHALL start as pending, and Trash recovery SHALL never revive a withdrawn grant.

#### Scenario: Leaving
- **WHEN** Anna leaves the folder "Metal", which she accepted by invitation
- **THEN** she may no longer read "Metal" or its lists, and Ben, also invited, still may

#### Scenario: Another path stays
- **WHEN** Anna also saved "Metal" through its link, and leaves the invitation
- **THEN** she still reads "Metal" through the link

### Requirement: Owners revoke invitations
An owner SHALL be able to revoke any pending or accepted invitation from the sharing dialog, in the app only (FR-07.15, X-03). Revoking SHALL block that path only; the recipient's other paths SHALL remain.

#### Scenario: Remove access
- **WHEN** the owner chooses Remove access for Anna's accepted invitation to "Doom"
- **THEN** Anna may no longer read "Doom", and the dialog no longer lists her

### Requirement: Links don't come back
Turning a link off SHALL invalidate it and the descendant access through it for good; turning it on again SHALL make a new link, and old links SHALL never work again (FR-07.16). References that relied only on the old link SHALL become inaccessible, and SHALL NOT move to the new link by themselves.

#### Scenario: A saved link turned off and on
- **WHEN** Anna saved "Doom" through its link, and the owner turns the link off and on again
- **THEN** Anna's reference no longer opens "Doom" until she saves it again through the new link
