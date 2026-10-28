// Public entry point of @tonaris/db: schema, connections and migrations (TS-11, TS-17).

export {
  activeSessionIds,
  findCreator,
  findUserByEmail,
  insertCreator,
  type UserRow,
} from "./accounts";
export {
  admissionsPaused,
  admitAccount,
  findAdmissionInvitation,
  insertAdmissionInvitation,
  revokeAdmissionInvitation,
  setAdmissionsPaused,
  type Admission,
  type AdmissionInvitationRow,
} from "./admission";
export { createApproval, decideApproval, findApproval, type ApprovalRow } from "./approvals";
export { maxMergeCandidates, mergeCandidates, savedAlbumsOf } from "./capture";
export { createDatabase, type Database, type Transaction } from "./client";
export { readFieldDeletion, readFieldUsage, readOptionRemoval } from "./field-options";
export { purgeExpiredTrash } from "./sync";
export { databaseUrl, redact } from "./config";
export { albumReleaseGroup, enrichAlbum, type Enrichment } from "./enrichment";
export {
  addToList,
  albumDeletionTargets,
  collectionOverview,
  findConnection,
  listConnections,
  listContainer,
  revokeConnection,
  searchAlbums,
  trashAlbums,
  type AlbumMatch,
  type CollectionOverview,
  type ConnectionRow,
  type ContainerListing,
  type ContainerRef,
  type ListAddition,
  type TrashResult,
} from "./mcp";
export { runExclusively } from "./locks";
export { migrateDatabase, migrationsFolder } from "./migrations";
export { albumProvenance } from "./provenance";
export { providerCacheStore, pruneProviderCache } from "./provider-cache";
export { findLinkedAlbum } from "./service-links";
export * from "./schema";
export {
  bootstrapSnapshot,
  claimMutation,
  claimTimeoutMs,
  executeBatch,
  executeMutation,
  findMutationResult,
  finishMutation,
  headSeq,
  mutationRunning,
  releaseClaim,
  pruneSyncHistory,
  readChanges,
  type Claim,
  type ExecutedMutation,
} from "./sync";
