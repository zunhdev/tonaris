// What every command builds its answer from (TS-20 step 4): telling a refusal apart from what was looked up, the
// `applied` and `conflict` outcomes, the account a principal acts for under the policy (TS-30), and the checks of
// field-level compare-and-set (TS-21).

import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import { failure, type Failure, type FieldConflict, type Outcome } from "./outcomes";
import { authorizeWrite, type OperationScope } from "./policies";
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
