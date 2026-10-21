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
  containerKinds,
  containerSchema,
  membershipSchema,
  type Container,
  type ContainerKind,
  type Membership,
} from "./containers";
export {
  runCommand,
  type ChangeInput,
  type CollectionStore,
  type CommandContext,
  type CommandResult,
  type StoredAlbum,
} from "./commands";
export { uuidv7, uuidv7Time } from "./ids";
export { findNameConflict, isBlankName, type NamedItem } from "./names";
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
  mutationResultSchema,
  mutationSchema,
  streamResetReasons,
  streamResetSchema,
  syncRetentionMs,
  type Bootstrap,
  type Change,
  type ChangeOp,
  type Mutation,
  type MutationName,
  type MutationResult,
  type StreamReset,
} from "./sync";
