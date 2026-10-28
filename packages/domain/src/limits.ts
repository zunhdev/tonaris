// Resource limits (TS-18, approved by the creator on 17 October 2026; FR-15.4). Each is one constant, checked by
// the commands under the owner's write lock; raising a limit is a change here. The rest of TS-18's values join as
// the features that need them arrive.

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

/** Characters in a pasted link: longer input isn't a link of the four services (TS-40). */
export const maxLinkLength = 2_048;

/** Items in one batch, from any client: the app, native clients or MCP (TS-25, decided 22 October 2026). */
export const maxBatchItems = 200;

/** Custom fields per account (TS-18). */
export const maxFields = 50;

/** Options per choice field (TS-18). */
export const maxFieldOptions = 100;
