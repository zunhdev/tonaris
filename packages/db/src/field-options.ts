// What removing an option or deleting a field affects, for their confirmations (FR-03.17, FR-03.18, TS-14, DS-60):
// the field, the option or the options, and the albums choosing or applying it, active and in Trash, with the scope's
// hash. The removal or deletion recomputes the scope under the owner's lock and runs only if the hash is the same.

import {
  fieldDeletion,
  optionRemoval,
  type FieldDeletion,
  type OptionRemoval,
} from "@tonaris/domain";

import type { Database } from "./client";
import { fieldUsersIn, findFieldIn, optionUsersIn } from "./sync";

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

/** The deletion of the field, if it is `accountId`'s; undefined otherwise. */
export async function readFieldDeletion(
  db: Database,
  accountId: string,
  fieldId: string,
): Promise<FieldDeletion | undefined> {
  return db.transaction(
    async (tx) => {
      const field = await findFieldIn(tx, fieldId);
      if (!field || field.ownerId !== accountId) return undefined;
      return fieldDeletion(field, await fieldUsersIn(tx, fieldId));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
