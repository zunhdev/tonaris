// What removing an option affects, for its confirmation (FR-03.17, TS-14, DS-60): the field, the option, and the
// albums choosing it, active and in Trash, with the scope's hash. The removal recomputes the scope under the owner's
// lock and runs only if the hash is still the same.

import { optionRemoval, type OptionRemoval } from "@tonaris/domain";

import type { Database } from "./client";
import { findFieldIn, optionUsersIn } from "./sync";

/** The removal of the option, if it is an option of `accountId`'s field; undefined otherwise. */
export async function readOptionRemoval(
  db: Database,
  accountId: string,
  fieldId: string,
  optionId: string,
): Promise<OptionRemoval | undefined> {
  return db.transaction(
    async (tx) => {
      const field = await findFieldIn(tx, fieldId);
      const option = field?.options.find((each) => each.id === optionId);
      if (!field || field.ownerId !== accountId || !option) return undefined;
      return optionRemoval(field, option, await optionUsersIn(tx, fieldId, optionId));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
