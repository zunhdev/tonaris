# Design

## Context

The sidebar's Invitations reads `GET /v1/invitations` on load, on focus, every minute and after an answer (`pending-invitations.ts`), because another account's invitation can't reach the recipient's change stream. It kept only the count. Toasts go through `useNotify()`, whose kinds are information (4 s), undo (8 s) and problem (until closed).

## Decisions

### 1. The same reads, kept as a list

The store keeps the pending invitations, not just their count, and tells its readers only when the set of IDs changes. The count is the list's length. No new request or stream: the creator chose a toast that can be up to a minute late over pushing invitations into the recipient's stream.

### 2. Announced once per device

`InvitationToasts`, in the shell, compares each read with the IDs already announced on the device (localStorage, per account) and then keeps only the pending ones there, so the record stays short. Before the first read answers, nothing is compared, so a reload doesn't announce them again. On the Invitations pages, new ones are marked announced without a toast, since they're already in view. Tabs share the record, so a later read in another tab doesn't repeat it.

### 3. A notice

Information's 4 s is short for news someone else sent, with an action to take. The notice kind stays 8 s, like Undo, is polite, and its one action closes it. One invitation names its owner and collection; several read as a count, with View opening the inbox.
