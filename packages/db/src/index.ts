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
export { createDatabase, type Database, type Transaction } from "./client";
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
  executeBatch,
  executeMutation,
  findMutationResult,
  headSeq,
  pruneSyncHistory,
  readChanges,
  type ExecutedMutation,
} from "./sync";
