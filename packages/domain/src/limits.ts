// Resource limits (TS-18, approved by the creator on 17 October 2026; FR-15.4). Each is one constant, checked by
// the commands under the owner's write lock; raising a limit is a change here. The rest of TS-18's values join as
// the features that need them arrive.

/**
 * Albums per account, counting those in Trash until they are purged (FR-15.1, FR-15.2). Restoring or re-adding one
 * reuses its slot, so only a new record can be refused.
 */
export const maxAlbums = 5_000;

/** Link captures per account per hour, from the app or MCP (TS-18). */
export const maxCapturesPerHour = 100;

/** Data exports per account per hour (TS-18, TS-80). */
export const maxExportsPerHour = 5;

/**
 * Characters in an album's title or artist credit, counted in code points (decided by the creator on 29 October 2026,
 * TON-95). Real titles reach about 450, and classical credits run long.
 */
export const maxAlbumTextLength = 1_000;

/** Folders and lists per account, counting those in Trash until they are purged (decided 21 October 2026). */
export const maxContainers = 2_000;

/** Levels of folders and lists: a container at the root is at level 1 (FR-01.1). */
export const maxContainerDepth = 32;

/** Characters in a container, field or option name, counted in code points. */
export const maxNameLength = 200;

/** Characters in a folder's or list's description, counted in code points (FR-03.5). */
export const maxDescriptionLength = 2_000;

/** List entries per account, counting those whose list or album is in Trash until purged (decided 22 October 2026). */
export const maxMemberships = 50_000;

/** Characters in a pasted link: longer input isn't a link of any of the streaming services (TS-40). */
export const maxLinkLength = 2_048;

/** Items in one batch, from any client: the app, native clients or MCP (TS-25, decided 22 October 2026). */
export const maxBatchItems = 200;

/** Custom fields per account (TS-18). */
export const maxFields = 50;

/** Options per choice field (TS-18). */
export const maxFieldOptions = 100;

/** Characters in a custom field's text value, counted in code points (TS-18). */
export const maxTextValueLength = 2_000;

/** Days deleted folders, lists and albums stay recoverable in Trash, then go for good (FR-01.12, FR-14.1, FR-14.5). */
export const trashRetentionDays = 30;

/** Merge candidates asked about per capture, at most: each costs a MusicBrainz lookup at 1 a second (TS-44). */
export const maxMergeCandidates = 5;
