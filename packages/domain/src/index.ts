// Public entry point of @tonaris/domain: business rules shared by the API, MCP and every client (TS-02).
// Framework-free and runtime-neutral: it runs in Bun and in browsers, so no framework, database, Bun or
// Node imports (enforced by oxlint).

export {
  accountSchema,
  emailKey,
  signInCode,
  userRoles,
  type Account,
  type UserRole,
} from "./accounts";
export {
  admissionInvitationDays,
  admissionInvitationStatuses,
  admissionRefusalDetails,
  invitationStatus,
  joinCodeRequestSchema,
  joinSchema,
  type AdmissionInvitationStatus,
  type AdmissionRefusal,
} from "./admission";
export {
  renderEmail,
  type EmailPort,
  type EmailTemplate,
  type EmailTemplates,
  type RenderedEmail,
} from "./email";
export {
  albumFields,
  albumFieldsSchema,
  albumProblem,
  albumSchema,
  releaseTypes,
  type Album,
  type AlbumField,
  type AlbumFields,
} from "./albums";
export {
  albumDeletionScope,
  albumDeletionScopeSchema,
  approvalConsequences,
  approvalDecisionSchema,
  approvalOperations,
  approvalSchema,
  approvalState,
  approvalStates,
  approvalStatuses,
  approvalSummary,
  approvalValidMinutes,
  canonicalJson,
  scopeHash,
  trashRetentionDays,
  type AlbumDeletionScope,
  type AlbumDeletionTarget,
  type Approval,
  type ApprovalDecision,
  type ApprovalOperation,
  type ApprovalScope,
  type ApprovalState,
  type ApprovalStatus,
} from "./approvals";
export {
  batchItemSchema,
  batchResultSchema,
  batchSchema,
  runBatch,
  type Batch,
  type BatchItem,
  type BatchResult,
} from "./batches";
export {
  containerKinds,
  containerNameProblem,
  containerSchema,
  nameTakenProblem,
  type Container,
  type ContainerKind,
  type StoredContainer,
} from "./containers";
export {
  runCommand,
  type ChangeInput,
  type CollectionStore,
  type CommandContext,
  type CommandResult,
  type StoredAlbum,
} from "./commands";
export {
  blankAlbum,
  enrichableFields,
  planEnrichment,
  provenanceSources,
  type AlbumFacts,
  type EnrichableAlbum,
  type EnrichableField,
  type EnrichableFields,
  type EnrichmentPlan,
  type Identity,
  type ProvenanceEntry,
  type ProvenanceSource,
  type Sourced,
  type SourcedValues,
} from "./enrichment";
export { uuidv7, uuidv7Time } from "./ids";
export {
  maxBatchItems,
  maxContainerDepth,
  maxContainers,
  maxMemberships,
  maxNameLength,
} from "./limits";
export {
  linkEntityId,
  linkKinds,
  sameLink,
  serviceNames,
  streamingServices,
  type LinkKind,
  type LinkRef,
  type StreamingService,
} from "./links";
export { membershipKey, membershipSchema, type Membership } from "./memberships";
export { findNameConflict, isBlankName, type NamedItem } from "./names";
export { isOrderKey, maxOrderItems, positionKey, positionSchema, type Position } from "./positions";
export { caseFold, nameKey, searchKey, searchMatches } from "./normalize";
export {
  errorCodes,
  errorCodeSchema,
  failure,
  fieldConflictSchema,
  inputNeeds,
  invalidParamSchema,
  outcomeSchema,
  outcomeStatuses,
  problemSchema,
  skipReasons,
  type ErrorCode,
  type Failure,
  type FieldConflict,
  type Outcome,
  type OutcomeStatus,
  type Problem,
} from "./outcomes";
export {
  authorizeAdmissionAdmin,
  authorizeOwnerRead,
  authorizeWrite,
  type Decision,
  type OperationScope,
} from "./policies";
export {
  actingUserId,
  connectionSchema,
  mcpModeOf,
  mcpModes,
  mcpScopes,
  mcpScopesFor,
  type Connection,
  type McpMode,
  type McpPrincipal,
  type Principal,
} from "./principals";
export {
  bootstrapSchema,
  changeOps,
  changeSchema,
  membershipAddResultSchema,
  mutationResultSchema,
  mutationSchema,
  streamResetReasons,
  streamResetSchema,
  syncRetentionMs,
  type Bootstrap,
  type Change,
  type ChangeOp,
  type MembershipAddResult,
  type Mutation,
  type MutationName,
  type MutationResult,
  type StreamReset,
} from "./sync";
export {
  appViewDefaults,
  folderSortModes,
  listSortModes,
  sortDirections,
  sortModes,
  unsetView,
  viewDefaultsFields,
  viewDefaultsSchema,
  viewKeySchema,
  viewLayouts,
  viewPrefsFields,
  viewPrefsFieldsSchema,
  viewPrefsSchema,
  type ViewItems,
  type FolderSortMode,
  type ListSortMode,
  type SortDirection,
  type SortMode,
  type ViewDefaults,
  type ViewDefaultsField,
  type ViewLayout,
  type ViewPrefs,
  type ViewPrefsField,
  type ViewPrefsFields,
} from "./views";
