# sharing Specification

## Purpose

Read-only sharing of folders and lists: who may read shared content, by accepted invitation grants and by links, through the folder hierarchy and Trash, and what they see of it (FR-07).

## Requirements

### Requirement: Folder shares include current and future descendants
Access through a grant or a link on a folder SHALL extend to every active descendant, including ones created later (FR-07.8). New content outside any shared folder SHALL be readable by nobody but its owner (FR-07.2).

#### Scenario: A new list inside a shared folder
- **WHEN** the owner creates the list "Doom" inside the folder "Metal", which Anna has accepted
- **THEN** Anna may read "Doom"

#### Scenario: A new list at the top
- **WHEN** the owner creates the list "Private" at the top of the collection
- **THEN** no viewer may read it

### Requirement: Inherited access follows moves
Moving content into a shared folder SHALL give it that folder's audience, and moving it out SHALL remove access inherited only from folders that no longer contain it (FR-07.9). Direct shares on the moved content or its descendants SHALL remain.

#### Scenario: Moved out
- **WHEN** the owner moves the list "Doom" out of the shared folder "Metal" to the top
- **THEN** Metal's viewers may no longer read "Doom"

#### Scenario: A direct share stays
- **WHEN** "Doom" also has its own link, and it is moved out of "Metal"
- **THEN** the link still opens "Doom"

### Requirement: Only accepted grants and active links give access
A grant SHALL give access only while it is accepted; pending, declined, withdrawn and revoked grants SHALL give none (FR-07.6). A link SHALL give access only while it is not revoked (FR-07.16). Link tokens SHALL be 256-bit random secrets, stored only as hashes (TS-32).

#### Scenario: Pending
- **WHEN** Anna's invitation to "Metal" is still pending
- **THEN** Anna may not read "Metal"

#### Scenario: Revoked link
- **WHEN** the owner disables the link of "Metal"
- **THEN** its old token no longer opens anything

### Requirement: Trash suspends sharing and recovery resumes it
Content in Trash SHALL be readable through no sharing path, while its grants and links are kept (FR-07.10). Recovery SHALL resume links not revoked and grants still accepted. Pending invitations SHALL stay pending, and revocations made meanwhile SHALL stay in effect.

#### Scenario: Suspended and resumed
- **WHEN** the owner moves the shared folder "Metal" to Trash and recovers it
- **THEN** its viewers can't read it while it is in Trash, and can again after recovery

#### Scenario: Revoked meanwhile
- **WHEN** the owner disables Metal's link while "Metal" is in Trash, then recovers it
- **THEN** the link still opens nothing

### Requirement: Viewers see live content and only the fields it uses
A viewer of a shared container SHALL see its current active subtree, with descriptions, the active albums in its lists with their standard information and links, and the owner's display name (FR-07.11, FR-07.3). They SHALL see every custom field those albums use, with its values, and no unused field or option (FR-07.12). Albums outside the scope and private ancestors SHALL NOT be revealed.

#### Scenario: Used fields only
- **WHEN** the owner has the fields "Mood" and "Rating", and only "Mood" is applied to an album in the shared list
- **THEN** the viewer sees "Mood" with its value, and not "Rating"

#### Scenario: Albums outside the scope
- **WHEN** the shared list "Doom" holds "Nightfall", and "Bleach" is only in an unshared list
- **THEN** the viewer sees "Nightfall" and not "Bleach"

### Requirement: Owners share folders and lists by invitation and link
An owner SHALL share a folder or list read-only by inviting an existing account by email, by turning on a link, or both (FR-07.1). The collection's top is not shareable. Sharing SHALL be done in the app only (X-03).

#### Scenario: Inviting a member
- **WHEN** the owner invites "anna@example.com", which belongs to an account, to the list "Doom"
- **THEN** Anna's invitation shows as Pending in the dialog

#### Scenario: Turning on a link
- **WHEN** the owner turns on link sharing for "Doom"
- **THEN** the dialog shows the link with Copy, and the same link each time it opens

#### Scenario: Not through MCP
- **WHEN** an MCP connection tries to invite someone
- **THEN** it is refused as app-only

### Requirement: Invitations need an existing account
Inviting an address with no account SHALL be refused, creating no account, admission or invitation (FR-07.4, X-05). The refusal SHALL keep the typed address and suggest a link instead. Inviting the same person again SHALL never duplicate their invitation (FR-07.5).

#### Scenario: Not a member
- **WHEN** the owner invites "nobody@example.com"
- **THEN** "No Tonaris account uses this email. Invitations only work for existing members — you can share a link instead." shows, and the address stays in the field

#### Scenario: Invited twice
- **WHEN** the owner invites Anna to "Doom" twice
- **THEN** one invitation exists

### Requirement: Sharing is explained before it happens
The sharing dialog SHALL show, before any invitation or link (FR-07.14):
- that viewers see every custom field the albums use, including ones added later;
- for a folder, that everything inside it, now and in the future, is included;
- next to the link switch, that anyone with the link can view and forward it.

It SHALL list access inherited from folders above, read-only.

#### Scenario: A folder's disclosures
- **WHEN** the owner opens the dialog for the folder "Metal"
- **THEN** the field and descendant disclosures show above Invite, and the link disclosure beside the switch

#### Scenario: Inherited access
- **WHEN** "Metal" has a link and the owner opens the dialog for "Doom" inside it
- **THEN** it says "Doom" is also visible through "Metal" by link

### Requirement: Sharing needs a display name
Inviting and turning on a link SHALL require a non-blank display name (FR-11.3, TS-34). Without one, the dialog SHALL offer to add it in place. Clearing the display name SHALL be refused while any invitation is pending or accepted or any link is on (AC-38).

#### Scenario: No display name yet
- **WHEN** an owner without a display name opens the dialog
- **THEN** "Add a display name to share" replaces Invite and the link switch

#### Scenario: Clearing while sharing
- **WHEN** an owner with a link on clears their display name
- **THEN** it is refused, and the name stays

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

### Requirement: Guests browse a shared link
Anyone with a valid link SHALL browse its folders, lists and albums without signing in, and nothing outside it (FR-07.1, FR-11.9). The page SHALL be rendered on the server and never send its token in a Referer (TS-32). An unknown, revoked or suspended link SHALL say "This link isn't available. Ask the person who shared it for a new one.", revealing nothing.

#### Scenario: A shared folder
- **WHEN** a guest opens the link of the folder "Metal", which holds the list "Doom"
- **THEN** they see "Metal", "Shared by Denis", and "Doom", and can open "Doom" to see its albums

#### Scenario: A link turned off
- **WHEN** a guest opens a link its owner turned off
- **THEN** they read "This link isn't available. Ask the person who shared it for a new one."

### Requirement: Guests open albums in their services
Each album on a guest page SHALL offer its service links (FR-06.5), opened without passing the page's address on.

#### Scenario: Open in Spotify
- **WHEN** a guest opens the chooser of an album with a Spotify link
- **THEN** it offers Spotify, which opens the album in a new tab with no referrer

### Requirement: Guest presentation lasts the visit
A guest SHALL be able to sort, group and switch layouts for the visit only (FR-11.9). The page SHALL say that these settings aren't saved, and SHALL never change the owner's.

#### Scenario: Sorted by name
- **WHEN** a guest sorts a shared list by name and reloads the tab
- **THEN** the list is still sorted by name, and a new visit starts from the defaults

### Requirement: Guest pages stay live
A guest page SHALL show the owner's current saved content (FR-07.11), updating while open, and SHALL stop showing content once its link stops working.

#### Scenario: An album added
- **WHEN** the owner adds an album to the shared list while a guest has it open
- **THEN** the album appears on the guest's page within a few seconds, without reloading

### Requirement: Link shares are saved only on purpose
A signed-in person SHALL be able to add a link-shared folder or list to Shared with me from the link's page (FR-07.13, DS-68). Opening a link SHALL add nothing. Adding SHALL create no copy, use no slot, and reuse an existing reference; adding it again through a new link SHALL point the same reference at that link. Guests SHALL NOT be able to save references.

#### Scenario: Adding from the link
- **WHEN** a signed-in person opens a shared link and chooses Add to Shared with me
- **THEN** the banner reads "In Shared with me", and the collection is in their Shared with me

#### Scenario: Only opening
- **WHEN** a signed-in person opens a shared link and leaves
- **THEN** nothing is added to their Shared with me

### Requirement: References synchronize and can always be removed
References SHALL persist and synchronize across the person's devices (FR-07.13). A reference SHALL be removable at any time, even when its content is no longer accessible. Removing it SHALL revoke no grant and keep other access paths. References SHALL never grant access beyond current sharing; one that is no longer accessible SHALL say so.

#### Scenario: Another device
- **WHEN** a person adds a link to Shared with me on one device
- **THEN** their other signed-in device lists it without reloading

#### Scenario: No longer available
- **WHEN** the owner turns off the link a reference was saved through
- **THEN** Shared with me shows it dimmed as "No longer available", with Remove, which removes it

### Requirement: Shared with me lists references by owner
Shared with me SHALL group references by owner display name, marking those from invitations and those saved from links (DS-67). An invitation-based one SHALL offer Leave share…, confirming that the owner would have to invite again; a link-saved one SHALL offer Remove from Shared with me.

#### Scenario: Leaving from Shared with me
- **WHEN** a person chooses Leave share… on an invitation-based reference and confirms
- **THEN** it leaves Shared with me, and its owner would have to invite them again

### Requirement: Signed-in viewers open shared content in the app
A signed-in person SHALL open a folder or list shared with them in the app's shell, view-only (DS-70): a pill names the owner, and there are no editing controls (FR-07.17). The content SHALL stay current while open, and SHALL say it is no longer available once access ends (FR-07.11).

#### Scenario: Opening from Shared with me
- **WHEN** a person opens "Doom" from Shared with me
- **THEN** it shows "View only · Shared by Denis", its albums, and no mode toggle or Share button

#### Scenario: Access ends while open
- **WHEN** the owner removes the person's access while "Doom" is open
- **THEN** the page says it is no longer available

### Requirement: Viewers' presentation is their own
A viewer's sorting, grouping, layout and arrangement of shared content SHALL be saved for them and synchronized across their devices, and SHALL never change the owner's (FR-07.17, FR-05.2, AC-16). Account defaults SHALL apply to shared views not visited yet, and remembered choices SHALL win.

#### Scenario: Sorted by name
- **WHEN** a viewer sorts the shared list "Doom" by name
- **THEN** it stays sorted by name for them, on every device, and the owner's "Doom" keeps its own sort

#### Scenario: Their own arrangement
- **WHEN** a viewer in manual order moves an album up with ⌥↑
- **THEN** their order changes and the owner's arrangement doesn't

### Requirement: Moves preview their sharing consequences
Before a folder or list is moved on the desktop, by Move to… or by dragging onto the tree, Tonaris SHALL show the move's effective sharing consequences (FR-07.9, FR-07.14, DS-69): audiences that newly see it, audiences that no longer see it through the folders it leaves, and the direct shares it keeps, or that sharing is unchanged. It SHALL never name an audience as losing access while another access path keeps it.

#### Scenario: Into a shared folder
- **WHEN** the owner chooses a destination for "Doom" in Move to…, and the folder "Metal" there is shared with Anna
- **THEN** the dialog reads "Newly visible to Anna" before the move is made

#### Scenario: Another path remains
- **WHEN** "Doom" leaves "Metal", shared with Anna, for "Heavy", also shared with Anna
- **THEN** the preview doesn't say Anna loses access

### Requirement: Recovery previews its sharing consequences
Recovering a folder, list or album that would become visible to anyone SHALL ask first, showing the audiences it would be visible to and the direct shares that resume (FR-07.10, FR-07.14). Choosing a destination for a recovery SHALL show the consequences for that destination. Undoing a deletion just made SHALL NOT ask.

#### Scenario: A shared list from Trash
- **WHEN** the owner restores the list "Doom", shared with Anna, from Trash
- **THEN** a confirmation reads "Still shared directly with Anna", and nothing is restored until they choose Restore

#### Scenario: Nothing shared
- **WHEN** the owner restores a list nobody else could see
- **THEN** it is restored at once, as before

### Requirement: Search includes shared content
Search SHALL include content the person reads through accepted invitations and link-shared collections they saved to Shared with me, and nothing else of anyone else's (FR-12.3). Shared results SHALL be told apart from the person's own, name their owner, and show only locations the person can access, never a private ancestor's name. Results SHALL follow live changes, revocation, moves, Trash and recovery. The app and MCP SHALL find the same shared albums.

#### Scenario: A shared list found
- **WHEN** Anna, who accepted an invitation to Denis's folder "Metal", searches for "doom"
- **THEN** "Doom" appears under Shared with me, "Shared by Denis · Metal", and opening it shows it view-only

#### Scenario: A private ancestor
- **WHEN** "Metal" sits inside Denis's unshared folder "Private"
- **THEN** searching "private" finds nothing of Denis's, and no result's location names "Private"

#### Scenario: Access ends
- **WHEN** Denis revokes Anna's invitation
- **THEN** her next search finds nothing of "Metal"

### Requirement: Manage collection agents keep and drop references
A Manage collection agent SHALL be able to add a link-shared folder or list to the person's Shared with me from the link, and to remove a reference, as the person can in the app (FR-07.13, FR-10.4). A Read-only agent and a guest SHALL NOT change references (AC-24). Leaving, accepting and declining invitations SHALL stay in the app (X-03).

#### Scenario: Saving through an agent
- **WHEN** the person gives their Manage agent a share link to "Epic", and it saves it
- **THEN** "Epic" is in their Shared with me, from the link

#### Scenario: A Read-only agent
- **WHEN** a Read-only agent tries to save a share link
- **THEN** it is refused, and Shared with me is unchanged
