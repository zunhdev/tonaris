# Spec Delta

## ADDED Requirements

### Requirement: Invitations are emailed, with delivery reported apart
A new invitation SHALL be emailed to the recipient's current sign-in address, linking to it in the app; opening the link needs sign-in as the recipient, and forwarding it grants nothing (FR-07.5). Its delivery SHALL be reported apart from the invitation: sending, sent, failed, or unconfirmed. A failed email SHALL leave the invitation saved, for the owner to resend, and retries SHALL never duplicate either.

#### Scenario: Email fails
- **WHEN** the email of Anna's invitation can't be sent
- **THEN** the invitation stays pending, the owner's dialog says the email failed, and Resend sends it again

#### Scenario: A retried invitation
- **WHEN** the owner's client sends the same invitation twice
- **THEN** one invitation exists, and one email went out

### Requirement: Only the intended recipient accepts or declines
Pending and declined invitations SHALL grant nothing (FR-07.6). The signed-in recipient SHALL accept or decline in the app. Accepting SHALL grant read access to the shared folder or list and its descendants, and save it to the recipient's references, reusing an existing one; nothing is copied and no slots are used. Declining SHALL revoke no access from other grants or links. An invitation no longer valid SHALL grant nothing, and opening it SHALL say it is unavailable.

#### Scenario: Accepting
- **WHEN** Anna accepts her invitation to the folder "Metal"
- **THEN** she may read "Metal" and its lists, and it is in her references

#### Scenario: Someone else
- **WHEN** Ben opens Anna's invitation link while signed in as himself
- **THEN** he reads "This invitation is for a different account — sign out and sign in with that email", and nothing about the folder

#### Scenario: No longer available
- **WHEN** Anna opens an invitation she already declined
- **THEN** she reads "This invitation is no longer available"

### Requirement: Pending invitations show in the recipient's app
The recipient SHALL see their pending invitations in an inbox listing the owner's display name, the collection's name and type, and the date. The sidebar SHALL show Invitations, with their count, only while some are pending (DS-31, DS-66).

#### Scenario: The inbox
- **WHEN** Denis invites Anna to the list "Doom"
- **THEN** Anna's sidebar shows Invitations with 1, and her inbox lists "Doom", a list from Denis
