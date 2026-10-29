# Spec Delta

## ADDED Requirements

### Requirement: Deleting the account is warned and confirmed
Settings → Account SHALL offer **Delete account** in a Danger zone (DS-97). Its dialog SHALL list the full consequences: the collection, Unsorted and Trash are removed, settings and saved references are removed, shared content becomes unavailable to every viewer and guest, AI connections end, and nothing can be recovered (FR-11.10). Deleting SHALL need the sign-in email typed and **Delete account permanently**, in the app only (X-03). Cancelling SHALL change nothing.

#### Scenario: The warning
- **WHEN** someone opens Delete account
- **THEN** the dialog lists every consequence, and **Delete account permanently** works only once their sign-in email is typed

#### Scenario: Cancelling
- **WHEN** they close the dialog
- **THEN** nothing changes


### Requirement: The creator's account can't be deleted
The creator's account SHALL NOT be deletable, since it runs admissions and is the only one with the role (TS-71).

#### Scenario: The creator
- **WHEN** the creator asks to delete their account
- **THEN** it is refused with an explanation, and their Danger zone offers no Delete account

### Requirement: Deletion stops access at once and removes all owned data
Confirming SHALL at once end the account's sessions and AI connections, make its shared content unavailable to every viewer and guest, and stop its address from signing in (FR-11.11). Then all owned data SHALL be removed permanently, Trash included and nothing moved to Trash, and the account itself last. Other people's collections SHALL be untouched. Progress, completion and failure SHALL be reported, and a failure SHALL be retryable without claiming partial success.

#### Scenario: Access stops
- **WHEN** an account that shares a list by link and by invitation, and has an AI connection, is deleted
- **THEN** its sessions are signed out, the link's guest page and the invited viewer find the list unavailable, and the AI connection is gone

#### Scenario: Everything owned goes
- **WHEN** the deletion finishes
- **THEN** the page says "Your account has been deleted", and none of the account's folders, lists, albums, fields, Trash, settings or references remain, while another member's collection is unchanged

#### Scenario: Signing in later
- **WHEN** someone signs in with the deleted account's address
- **THEN** no account is reached or recreated, and a new account needs an invitation

#### Scenario: A failure
- **WHEN** the deletion job fails
- **THEN** the page says it couldn't finish and offers Retry, which runs it again
