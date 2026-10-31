// Public entry point of @tonaris/db: schema, connections and migrations (TS-11, TS-17).

export {
  activeSessionIds,
  agreedToTerms,
  agreeToTerms,
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
export {
  createApproval,
  decideApproval,
  findApproval,
  pendingApprovals,
  useApproval,
  type ApprovalRow,
  type ApprovalUse,
} from "./approvals";
export { capturesSince, maxMergeCandidates, mergeCandidates, savedAlbumsOf } from "./capture";
export { createDatabase, type Database, type Transaction } from "./client";
export {
  fieldDeletionIn,
  optionRemovalsIn,
  readFieldDeletion,
  readFieldUsage,
  readOptionRemoval,
} from "./field-options";
export { exportSource } from "./export";
export {
  disableFirstPartyClient,
  saveFirstPartyClient,
  type FirstPartyClient,
} from "./first-party-clients";
export { ledgerStore, recordInLedger, type LedgerStore } from "./ledger";
export {
  listPasskeys,
  removeAllPasskeys,
  removePasskey,
  renamePasskey,
  type PasskeyRow,
} from "./passkeys";
export { replayLedger, type ReplayReport } from "./ledger-replay";
export { reconcileRestored, type ReconcileReport } from "./reconcile";
export { operationsStatus, type OperationsStatus } from "./operations";
export { findFieldIn, lockAccount, purgeExpiredTrash } from "./sync";
export { databaseUrl, redact } from "./config";
export { albumReleaseGroup, enrichAlbum, type Enrichment } from "./enrichment";
export {
  albumDeletionTargets,
  collectionOverview,
  connectionUseInterval,
  findConnection,
  listConnections,
  listContainer,
  recordConnectionUse,
  revokeConnection,
  deletionTargets,
  savedAlbumOfReleaseGroup,
  activeListName,
  type AlbumMatch,
  type CollectionOverview,
  type ConnectionRow,
  type ContainerListing,
  type ContainerRef,
} from "./mcp";
export {
  albumDetail,
  albumSources,
  collectionTree,
  collectionUsage,
  containerPage,
  fieldsWithUsage,
  trashContents,
  unsortedPage,
  type AlbumDetail,
  type AlbumFieldValue,
  type AlbumSources,
  type CollectionUsage,
  type ContainerInfo,
  type ContainerPage,
  type FieldWithUsage,
  type Page,
  type SharedOwner,
  type SourcedAlbum,
  type TreeEntry,
} from "./mcp-reads";
export {
  albumBase,
  claimOperation,
  containerBase,
  fieldValueBase,
  findOperation,
  linkBase,
  viewPrefsBase,
  viewSequence,
  type OperationClaim,
} from "./mcp-writes";
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
