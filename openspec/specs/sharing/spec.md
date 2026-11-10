# sharing Specification

## Purpose

Sharing of folders and lists, to view or to edit: who may read or edit shared content, by accepted invitation grants and their roles and by links, through the folder hierarchy and Trash, and what they see of it (FR-07).

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
An owner SHALL share a folder or list by inviting an existing account by email, to view or to edit (FR-07.18), by turning on a link, which only gives view, or both (FR-07.1). The collection's top is not shareable. Sharing SHALL be done in the app only (X-03).

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
Pending and declined invitations SHALL grant nothing (FR-07.6). The signed-in recipient SHALL accept or decline in the app. Accepting SHALL grant the invitation's role on the shared folder or list and its descendants (FR-07.18), and save it to the recipient's references, reusing an existing one; nothing is copied and no slots are used. Declining SHALL revoke no access from other grants or links. An invitation no longer valid SHALL grant nothing, and opening it SHALL say it is unavailable.

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

### Requirement: New invitations are announced in the open app
A new pending invitation SHALL be announced once on the recipient's device, in the open app, naming its owner and collection, with a way to open it (FR-07.5, TON-129). Several found together SHALL be announced as one, with a way to the inbox.

#### Scenario: Announced once
- **WHEN** Denis invites Anna to the list "Doom" while her app is open
- **THEN** within a minute it reads "Denis shared "Doom" with you" with View, and reloading doesn't announce it again

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
Each album on a guest page SHALL show its service links (FR-06.5) as the album list does: each service by name, as a link, opened without passing the page's address on (TON-127).

#### Scenario: Open in Spotify
- **WHEN** a guest views a shared list holding an album with a Spotify link
- **THEN** its row shows "Spotify" as a link, which opens the album in a new tab with no referrer

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

### Requirement: The sidebar shows what's shared with the person
Shared with me SHALL open in the sidebar's tree to each folder or list in it (FR-07.13), with its owner's display name, and a shared folder SHALL open to its folders and lists, following the owner's saves while open (FR-07.11). Each SHALL open the shared view, which the tree marks (TON-130).

#### Scenario: A shared folder in the tree
- **WHEN** Denis has shared the folder 'Metal', holding the list 'Thrash', with a person who opens 'Metal' in the sidebar
- **THEN** the tree shows 'Metal · Denis' under Shared with me, with 'Thrash' inside it, which opens the shared view

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

### Requirement: Shared folders show as cards too
A shared folder SHALL show its folders and lists as cards fanning their covers or as rows: for a signed-in viewer in their own presentation, and for a guest as chosen for the visit, starting at cards (FR-07.17, FR-11.9, DS-41, TON-174).

#### Scenario: A guest switches to rows
- **WHEN** a guest opens a shared folder 'Metal' holding the list 'Doom' with two albums, then chooses Rows
- **THEN** 'Doom' first shows as a card fanning its two covers, reading "2 albums", then as a row

### Requirement: Viewers see a share's colors
People a folder or list is shared with, signed in or as guests, SHALL see its folders' and lists' colors as the owner set them, inherited within the share (FR-01.19, FR-07.11, TON-175).

#### Scenario: A guest sees a folder's color
- **WHEN** the owner colors the shared folder 'Metal' orange and a guest opens the link
- **THEN** the list 'Doom' inside it shows an orange icon

### Requirement: A destination's preview doesn't move the places above it
In "Move to…" and the restore prompt, the sharing preview SHALL keep room for two lines, and the dialog SHALL keep its top edge while open, so a change of preview, or of the folders found, never moves the field or the folders under the pointer (DS-69, TON-183).

#### Scenario: Pointing at another folder
- **WHEN** the preview for "Collection" reads "Sharing unchanged" and the owner points at "Metal", whose preview takes two lines
- **THEN** the dialog's top, the field and the folders stay where they were

### Requirement: Invitations carry a role
Each invitation SHALL carry a role, view or edit, chosen by the owner when inviting, view unless chosen otherwise (FR-07.18). Inviting someone who already has an open invitation SHALL keep it and its role. Links SHALL only ever give view.

#### Scenario: Inviting to edit
- **WHEN** the owner invites Anna to the list "Doom" with the role edit
- **THEN** Anna's pending invitation to "Doom" has the role edit

#### Scenario: The default
- **WHEN** the owner invites Ben to "Doom" without a role
- **THEN** Ben's invitation has the role view

### Requirement: Owners change roles
An owner SHALL be able to change the role of a pending or accepted invitation, in the app only (FR-07.15, FR-07.18, X-03). The person SHALL NOT accept again, and their access SHALL follow the new role from their next read or change. An ended invitation's role SHALL NOT change.

#### Scenario: Raised without a new acceptance
- **WHEN** Anna accepted an invitation to view "Doom", and the owner changes it to edit
- **THEN** Anna can edit "Doom" without accepting again

#### Scenario: Not through MCP
- **WHEN** an MCP connection tries to change a role
- **THEN** it is refused as app-only, and the role is unchanged

### Requirement: The highest role through folders applies
A person's role on a folder or list SHALL be the highest among their accepted invitations to it and to its active folders above (FR-07.18). Pending, declined, withdrawn and revoked invitations SHALL give none. Trash SHALL suspend a role as it suspends access, and recovery SHALL resume it.

#### Scenario: Edit through a folder
- **WHEN** Anna accepted an invitation to edit "Metal" and one to view "Doom" inside it
- **THEN** Anna's role on "Doom" is edit

#### Scenario: A link reads only
- **WHEN** Anna can read "Doom" only through a link she saved
- **THEN** her role on "Doom" is view

#### Scenario: Suspended by Trash
- **WHEN** the owner moves "Metal", which Anna can edit, to Trash and recovers it
- **THEN** Anna has no role inside "Metal" while it is in Trash, and edit again after recovery

### Requirement: Reads say the role
The owner's sharing settings SHALL give each invitation's role, and the nearest folder above through which that person can edit, if any (FR-07.18, DS-65). The recipient's invitations and Shared with me SHALL give the role. A shared folder or list SHALL say its reader's role.

#### Scenario: The owner's dialog
- **WHEN** Anna can edit "Metal" and is invited to view "Doom" inside it
- **THEN** the settings of "Doom" list Anna's invitation as view, editable through "Metal"

#### Scenario: Shared with me
- **WHEN** Anna accepted an invitation to edit "Doom"
- **THEN** her Shared with me gives "Doom" the role edit

### Requirement: Editors see all the owner's fields
A person who can edit a shared folder or list SHALL see all the owner's custom fields with all their options, used or not, so they can set them (FR-07.12, FR-07.20). Viewers SHALL still see only the fields the albums use, with only the options they choose.

#### Scenario: An unused field
- **WHEN** the owner has the field "Rating", which no shared album uses, and Anna can edit the share
- **THEN** Anna sees "Rating" with all its options, and Ben, who can view it, doesn't

### Requirement: A lowered role stays lowered after a restore
Lowering an invitation's role from edit to view SHALL be recorded in the revocation ledger, and a restore SHALL replay it, so a restored backup never brings edit rights back (FR-07.18, Q-04).

#### Scenario: Restored from before the change
- **WHEN** the owner lowers Anna's role on "Doom" to view, and the database is restored from a backup made before
- **THEN** after the ledger is replayed, Anna's role on "Doom" is view

### Requirement: Editors change folders and lists inside a share
Inside a folder or list they can edit, an editor SHALL create, rename, describe, color, move and delete folders and lists under the owner's rules, in the owner's collection, counting toward the owner's limits (FR-07.19). Something new at their own top level SHALL be theirs.

#### Scenario: A new list in the share
- **WHEN** Anna, who can edit "Metal", creates the list "Sludge" in it
- **THEN** "Sludge" is in Denis's collection, inside "Metal"

#### Scenario: Deleted to the owner's Trash
- **WHEN** Anna deletes the list "Doom" inside "Metal"
- **THEN** "Doom" is in Denis's Trash

### Requirement: The shared folder or list stays where its owner put it
An editor SHALL rename, describe and color the folder or list shared with them, and SHALL NOT move or delete it (FR-07.20).

#### Scenario: Renaming the share
- **WHEN** Anna renames "Metal", which she can edit, to "Heavy"
- **THEN** it is renamed for Denis and everyone it is shared with

#### Scenario: Deleting the share
- **WHEN** Anna tries to delete "Metal"
- **THEN** it is refused, and "Metal" stays

### Requirement: Editors move things only inside one share
An editor's move SHALL stay inside one share: never out of it, to the top level, into a folder they can't edit, or into another share (FR-07.20). The owner's depth and name rules SHALL still apply.

#### Scenario: Inside the share
- **WHEN** Anna moves "Doom" from "Metal" into "Funeral", also inside "Metal"
- **THEN** it moves

#### Scenario: Out of the share
- **WHEN** Anna tries to move "Doom" into Denis's unshared "Private", or into "Jazz", which she can also edit
- **THEN** it is refused, and "Doom" stays

### Requirement: Editors change albums in the share
An editor SHALL change an album's details, links, artwork and field values through a list they can edit that holds it, and the change SHALL show wherever the album appears (FR-07.19, FR-07.21). They SHALL NOT create, rename, retype or delete fields or options (FR-07.20).

#### Scenario: An album in the share
- **WHEN** Anna corrects the title of "Bleach", which is in "Doom" and in Denis's private "Secret"
- **THEN** the new title shows in both lists

#### Scenario: An album only in private lists
- **WHEN** Anna tries to change "Hidden", which is only in "Secret"
- **THEN** it is answered as not found

### Requirement: Editors add albums they see, and new ones
An editor SHALL add to a list they can edit an album they already see, a new album, or one captured from a link, in the owner's collection (FR-07.19). Adding SHALL NOT reach an album of the owner's they don't see, and a capture reusing one SHALL read as newly added (FR-07.21).

#### Scenario: A captured album the owner had
- **WHEN** Anna captures a link to "Bleach" into "Doom", and Denis has "Bleach" in no list she sees
- **THEN** Denis's "Bleach" is in "Doom", and Anna is told it was added

#### Scenario: An album by its ID
- **WHEN** Anna asks to add "Hidden", which she doesn't see, to "Doom"
- **THEN** it is answered as not found

### Requirement: An editor's album deletion leaves the share only
An editor's deletion of an album SHALL take it out of the lists they edit (FR-07.21). The owner's other lists SHALL keep it; with none, it SHALL go to the owner's Trash. The editor's outcome SHALL be the same either way.

#### Scenario: Kept in a private list
- **WHEN** Anna deletes "Bleach", which is in "Doom" and in Denis's "Secret"
- **THEN** it leaves "Doom", stays in "Secret", and is not in Trash

#### Scenario: Only in the share
- **WHEN** Anna deletes "Nightfall", which is only in "Doom"
- **THEN** it is in Denis's Trash

### Requirement: Editors undo their own deletions only
An editor SHALL restore a folder or list they deleted, in the app, back where it was while they can still edit there (FR-07.20). Everything else in the owner's Trash, and emptying it, SHALL stay the owner's.

#### Scenario: Undo
- **WHEN** Anna deletes "Doom" and chooses Undo
- **THEN** "Doom" is back in "Metal"

#### Scenario: The owner's deletion
- **WHEN** Denis deletes "Deep" and Anna asks to recover it
- **THEN** it is answered as not found, and stays in Trash

### Requirement: Refusals reveal nothing outside a share
A person who can only read a folder, list or album SHALL be told they can view it but not change it. Anyone else's change to content they can't read SHALL be answered as for content that doesn't exist (FR-07.20).

#### Scenario: A viewer
- **WHEN** Ben, who can view "Metal", tries to rename "Doom"
- **THEN** he is told he can view it but not change it

#### Scenario: A stranger
- **WHEN** Cleo, who has no access, tries to rename "Doom"
- **THEN** she is told it doesn't exist

### Requirement: An editor's changes are the owner's
An editor's change SHALL be saved in the owner's collection and reach the owner's devices and the share's viewers live (FR-07.19, X-08). Its retries and the hourly limit on link captures SHALL be the editor's. A lowered role or revoked invitation SHALL refuse their next change.

#### Scenario: Live to the owner
- **WHEN** Anna renames "Doom" while Denis has the app open
- **THEN** Denis's "Doom" shows the new name without reloading

#### Scenario: Role lowered
- **WHEN** Denis lowers Anna's role on "Metal" to view, and Anna renames "Doom"
- **THEN** she is told she can view it but not change it

### Requirement: Editors' agents edit as they do
An editor's Manage collection connection SHALL change a share as the editor can, and a Read-only one SHALL NOT (FR-10.3, FR-10.4).

#### Scenario: A Read-only connection
- **WHEN** Anna's Read-only connection tries to rename "Doom"
- **THEN** it is refused, and "Doom" keeps its name
