// What every command builds its answer from (TS-20 step 4): telling a refusal apart from what was looked up, the
// `applied` and `conflict` outcomes, the account a principal acts for under the policy (TS-30), and the checks of
// field-level compare-and-set (TS-21).

import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import { failure, type Failure, type FieldConflict, type Outcome } from "./outcomes";
import { authorizeShareEdit, authorizeWrite, type OperationScope } from "./policies";
import { actingUserId } from "./principals";

/** Whether a lookup or check answered a refusal rather than what it looks for. */
export function isFailure(value: unknown): value is Failure {
  return (
    typeof value === "object" && value !== null && "status" in value && value.status === "failed"
  );
}

/** The command's changes for the log, in order; none when it changes nothing. */
export function applied(...changes: ChangeInput[]): CommandResult {
  return { status: "applied", changes };
}

/**
 * The compare-and-set conflict of one field (TS-21): its saved value, the one attempted, and the `base` the change
 * assumed. Without `base`, the change was a create sent again.
 */
export function conflict(
  field: string,
  current: unknown,
  attempted: unknown,
  base?: unknown,
): Extract<Outcome, { status: "conflict" }> {
  return {
    status: "conflict",
    conflicts: [
      base === undefined ? { field, current, attempted } : { field, current, attempted, base },
    ],
  };
}

/**
 * The account the principal acts for, if it may change its own `scope` (TS-30), or why not. `refusal` says what it
 * can't do; someone acting for nobody, a guest, is told `guestRefusal` when it is given.
 */
export function actingOwner(
  { principal }: CommandContext,
  scope: Exclude<OperationScope, "admission">,
  refusal: string,
  guestRefusal = refusal,
): string | Failure {
  const ownerId = actingUserId(principal);
  if (ownerId === undefined) return failure("permission_denied", guestRefusal);
  const decision = authorizeWrite(principal, { ownerId, scope });
  return decision.allowed ? ownerId : failure(decision.code, refusal);
}

/**
 * How the principal may change content in a folder or list (TS-30, FR-07.18): as its owner, or as an editor through
 * the shares listed, the folders or lists their edit grants are on (`through`).
 */
export type ContentAccess =
  | { as: "owner" }
  | { as: "editor"; userId: string; through: readonly string[] };

/** The refusal of someone who may read a folder or list, or an album in one, but not change it (FR-07.18). */
export const viewOnly = (what: string) =>
  failure("permission_denied", `You can view ${what}, but not change it.`);

/**
 * How the principal may change content in `container` (TS-30, FR-07.18, FR-07.19), or why not. Its owner, under the
 * policy; a person, or their Manage connection, who edits it through a share; a reader is told they can only view; and
 * anyone else is answered as if it didn't exist, `missing`, so nobody learns of a private folder (FR-07.20).
 */
export async function contentAccess(
  { principal, store }: CommandContext,
  container: { id: string; ownerId: string },
  { refusal, missing, what = "this" }: { refusal: string; missing: string; what?: string },
): Promise<ContentAccess | Failure> {
  const userId = actingUserId(principal);
  if (userId === undefined || userId === container.ownerId) {
    const decision = authorizeWrite(principal, { ownerId: container.ownerId, scope: "collection" });
    return decision.allowed ? { as: "owner" } : failure(decision.code, refusal);
  }
  const decision = authorizeShareEdit(principal);
  if (!decision.allowed) return failure(decision.code, refusal);
  const through = await store.editSourcesAbove(userId, container.id);
  if (through.length > 0) return { as: "editor", userId, through };
  if (await store.canReadShared(userId, container.id)) return viewOnly(what);
  return failure("not_found", missing);
}

/**
 * Whether an editor works inside the folder or list `id` rather than on a share's own: through a share above it
 * (FR-07.20). The owner always does.
 */
export const insideShare = (access: ContentAccess, id: string): boolean =>
  access.as === "owner" || access.through.some((top) => top !== id);

/** The refusal of an editor's move or deletion of a shared folder or list itself (FR-07.20). */
export const shareTopRefusal = () =>
  failure(
    "permission_denied",
    "Only its owner can move or delete the shared folder or list itself. You can rename it, describe it and color it.",
  );

/**
 * Whose collection something new goes in (FR-07.19): the principal's own, or, inside a folder or list someone shared
 * with them to edit, that owner's. A folder they can't edit answers why; one they don't know of is left to the command's
 * own destination check, as before.
 */
export async function collectionFor(
  context: CommandContext,
  containerId: string | null,
  refusal: string,
): Promise<string | Failure> {
  const own = actingOwner(context, "collection", refusal);
  if (containerId === null) return own;
  const container = await context.store.findContainer(containerId);
  if (!container || container.ownerId === actingUserId(context.principal)) return own;
  const access = await contentAccess(context, container, { refusal, missing: refusal });
  if (isFailure(access)) return access.code === "not_found" ? own : access;
  return container.ownerId;
}

/** The refusal of an update that names no field. */
export function nothingChanged(): Failure {
  return failure("validation_failed", "The mutation changes nothing.", [
    { path: "args", message: "Name at least one field" },
  ]);
}

/** Why `base` doesn't name the prior value of exactly the fields in `changed`, if it doesn't (TS-21). */
export function baseProblem<Field extends string>(
  fields: readonly Field[],
  changed: readonly Field[],
  base: Partial<Record<Field, unknown>>,
): Failure | undefined {
  const unbased = changed.filter((field) => base[field] === undefined);
  const extra = fields.filter((field) => base[field] !== undefined && !changed.includes(field));
  if (unbased.length === 0 && extra.length === 0) return undefined;
  return failure(
    "validation_failed",
    "`base` must hold the prior value of exactly the changed fields.",
    [
      ...unbased.map((field) => ({ path: `base.${field}`, message: "Required" })),
      ...extra.map((field) => ({ path: `base.${field}`, message: "Not changed by this mutation" })),
    ],
  );
}

/** The fields whose saved value isn't the one `base` says the change was made from (TS-21). */
export function staleFields<Fields extends object>(
  fields: readonly (keyof Fields & string)[],
  current: Fields,
  attempted: Partial<Fields>,
  base: Partial<Fields>,
): FieldConflict[] {
  return fields
    .filter((field) => current[field] !== base[field])
    .map((field) => ({
      field,
      current: current[field],
      attempted: attempted[field],
      base: base[field],
    }));
}
