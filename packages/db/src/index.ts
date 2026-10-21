// Public entry point of @tonaris/db: schema, connections and migrations (TS-11, TS-17).

export { findCreator, findUserByEmail, insertCreator, type UserRow } from "./accounts";
export {
  admissionsPaused,
  admitAccount,
  findAdmissionInvitation,
  insertAdmissionInvitation,
  revokeAdmissionInvitation,
  setAdmissionsPaused,
  type Admission,
  type AdmissionInvitationRow,
  type Transaction,
} from "./admission";
export { createApproval, decideApproval, findApproval, type ApprovalRow } from "./approvals";
export { createDatabase, type Database } from "./client";
export { databaseUrl, redact } from "./config";
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
export { migrateDatabase, migrationsFolder } from "./migrations";
export * from "./schema";
export {
  bootstrapSnapshot,
  executeMutation,
  findMutationResult,
  headSeq,
  pruneSyncHistory,
  readChanges,
  type ExecutedMutation,
} from "./sync";
