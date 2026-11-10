// Authorization (TS-30): decided here and in the sharing model, never in route handlers or MCP tools. Here: owned
// content, editors' content, and the app-only rules. Reads through sharing (grants, saved links, guests) and edits
// through editors' grants follow the hierarchy, as `readableContainers` and `editableContainers` in sharing.ts define
// them (TS-31).

import type { ErrorCode } from "./outcomes";
import { actingUserId, type Principal } from "./principals";

export type Decision =
  | { allowed: true }
  | { allowed: false; code: Extract<ErrorCode, "permission_denied" | "app_only"> };

const allow: Decision = { allowed: true };
const deny = (code: "permission_denied" | "app_only"): Decision => ({ allowed: false, code });

/**
 * What an operation touches. Only `collection` operations (content and personal preferences) may come
 * through MCP; the others are app-only (X-03).
 */
export type OperationScope =
  | "collection"
  | "trash_purge"
  | "sharing"
  | "account"
  | "connections"
  | "admission";

/**
 * Whether `principal` may change data owned by `ownerId` (X-01, X-03, FR-10.3). Users change only their
 * own collection and preferences; an MCP connection only its user's, only in Manage mode, and never an
 * app-only operation, whatever the mode or approval. Guests never write.
 */
export function authorizeWrite(
  principal: Principal,
  { ownerId, scope }: { ownerId: string; scope: Exclude<OperationScope, "admission"> },
): Decision {
  if (principal.kind === "mcp") {
    if (scope !== "collection") return deny("app_only");
    if (principal.mode !== "manage") return deny("permission_denied");
  }
  return actingUserId(principal) === ownerId ? allow : deny("permission_denied");
}

/**
 * Whether `principal` may change someone else's content where it has an editor's role (FR-07.18, FR-07.19, FR-10.4):
 * a signed-in person, or their Manage collection connection; never a guest or a Read-only connection. Only `collection`
 * operations: sharing, Trash purges, accounts and connections stay the owner's (FR-07.20). The role itself comes from
 * the sharing model (TS-31).
 */
export function authorizeShareEdit(principal: Principal): Decision {
  if (principal.kind === "guest") return deny("permission_denied");
  if (principal.kind === "mcp" && principal.mode !== "manage") return deny("permission_denied");
  return allow;
}

/** Admission administration: the creator, in the app only (FR-11.6, X-03, TS-30). */
export function authorizeAdmissionAdmin(principal: Principal): Decision {
  if (principal.kind === "mcp") return deny("app_only");
  return principal.kind === "user" && principal.role === "creator"
    ? allow
    : deny("permission_denied");
}
