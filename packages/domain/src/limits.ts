// Resource limits (TS-18, approved by the creator on 17 October 2026; FR-15.4). Each is one constant, checked by
// the commands under the owner's write lock; raising a limit is a change here. The rest of TS-18's values join as
// the features that need them arrive.

/** Folders and lists per account, counting those in Trash until they are purged (decided 21 October 2026). */
export const maxContainers = 2_000;

/** Levels of folders and lists: a container at the root is at level 1 (FR-01.1). */
export const maxContainerDepth = 32;

/** Characters in a container, field or option name, counted in code points. */
export const maxNameLength = 200;
