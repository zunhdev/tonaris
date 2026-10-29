// Public entry point of @tonaris/db: schema, connections and migrations (TS-11, TS-17).

export {
  activeSessionIds,
  findCreator,
  findUserByEmail,
  insertCreator,
  type UserRow,
} from "./accounts";
export {
  beginAccountDeletion,
  deleteAccountData,
  deletedEmailKey,
  deletionChunkSize,
  findAccountDeletion,
  finishAccountDeletion,
  pruneAccountDeletions,
  retryAccountDeletion,
  type AccountDeletionRow,
} from "./account-deletion";
export {
  cancelEmailRecovery,
  confirmEmailRecovery,
  issueEmailRecovery,
  listMembers,
  type EmailRecoveryConfirmation,
  type MemberRow,
} from "./email-recoveries";
export {
  cancelEmailChange,
  findEmailChange,
  renewEmailChangeCode,
  startEmailChange,
  submitEmailChangeCode,
  type EmailChangeRow,
  type EmailChangeSubmission,
} from "./email-changes";
export {
  admissionsPaused,
  admitAccount,
  createAdmissionInvitation,
  expireAdmissionInvitations,
  findAdmissionInvitation,
  findAdmissionInvitationById,
  listAdmissionInvitations,
  recordAdmissionEmail,
  revokeAdmissionInvitation,
  rotateAdmissionToken,
  setAdmissionsPaused,
  type Admission,
  type AdmissionInvitationRow,
  type AdmissionIssue,
} from "./admission";
export { createApproval, decideApproval, findApproval, type ApprovalRow } from "./approvals";
export { capturesSince, maxMergeCandidates, mergeCandidates, savedAlbumsOf } from "./capture";
export { createDatabase, type Database, type Transaction } from "./client";
export { readFieldDeletion, readFieldUsage, readOptionRemoval } from "./field-options";
export { purgeExpiredTrash } from "./sync";
export { databaseUrl, redact } from "./config";
export { albumReleaseGroup, enrichAlbum, type Enrichment } from "./enrichment";
export {
  addToList,
  albumDeletionTargets,
  collectionOverview,
  connectionUseInterval,
  findConnection,
  listConnections,
  listContainer,
  recordConnectionUse,
  revokeConnection,
  trashAlbums,
  type AlbumMatch,
  type CollectionOverview,
  type ConnectionRow,
  type ContainerListing,
  type ContainerRef,
  type ListAddition,
  type TrashResult,
} from "./mcp";
export {
  buryJob,
  claimJob,
  deadJobRetentionMs,
  enqueueJob,
  finishJob,
  pruneDeadJobs,
  retryJob,
  type JobRow,
} from "./jobs";
export { runExclusively } from "./locks";
export { migrateDatabase, migrationsFolder } from "./migrations";
export { albumProvenance } from "./provenance";
export { providerCacheStore, pruneProviderCache } from "./provider-cache";
export {
  invitationState,
  invitationToDeliver,
  pendingInvitations,
  recordInvitationEmail,
} from "./invitations";
export { fillSearchKeys } from "./migrations";
export { searchCollection } from "./search";
export { canReadContainer, readableContainers } from "./access";
export { sharingImpact, type ImpactQuery } from "./sharing-impact";
export {
  findShareLink,
  linkReferenceState,
  sharedOwner,
  shareSettings,
  sharedSnapshot,
  sharedWithMe,
  type ShareSettingsRow,
} from "./sharing";
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
