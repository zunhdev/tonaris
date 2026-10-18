// Public entry point of @tonaris/domain: business rules shared by the API, MCP and every client (TS-02).
// Framework-free and runtime-neutral: it runs in Bun and in browsers, so no framework, database, Bun or
// Node imports (enforced by oxlint).

export { findNameConflict, isBlankName, type NamedItem } from "./names";
export { caseFold, nameKey, searchKey, searchMatches } from "./normalize";
export {
  errorCodes,
  errorCodeSchema,
  fieldConflictSchema,
  inputNeeds,
  invalidParamSchema,
  outcomeSchema,
  outcomeStatuses,
  problemSchema,
  type ErrorCode,
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
export { actingUserId, mcpModes, type McpMode, type Principal } from "./principals";
