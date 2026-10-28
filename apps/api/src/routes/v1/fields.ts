// What removing an option or deleting a field affects, for their confirmations (FR-03.17, FR-03.18, TS-14, DS-60):
// the field, the option or options, the albums choosing or applying it, active and in Trash, and the hash that
// confirms exactly that scope to `field.removeOption` or `field.delete`. Another account's field is answered as
// missing, so nobody can probe for other people's IDs.

import { Elysia } from "elysia";
import { z } from "zod";

import { readFieldDeletion, readFieldUsage, readOptionRemoval, type Database } from "@tonaris/db";
import {
  fieldDeletionSchema,
  fieldUsageListSchema,
  optionRemovalSchema,
  problemSchema,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

export function fieldRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .get(
      "/fields/usage",
      {
        signedIn: true,
        response: { 200: fieldUsageListSchema, 401: problemSchema },
        detail: {
          summary: "Get how many albums use each field",
          description:
            "Every field of the account, with the albums applying it, active and in Trash, even empty. Settings shows it, and a used field's type can't change (FR-03.12, DS-60).",
          tags: ["fields"],
          operationId: "getFieldUsage",
        },
      },
      async ({ account }) => readFieldUsage(db, account.id),
    )
    .get(
      "/fields/:fieldId/deletion",
      {
        signedIn: true,
        params: z.object({ fieldId: z.uuid() }),
        response: {
          200: fieldDeletionSchema,
          401: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Get what deleting a field affects",
          description:
            "The field with its options, the albums applying it, active and in Trash, and the scope hash that confirms deleting exactly that. `field.delete` always needs that hash, and refuses it if the field or the albums applying it changed meanwhile (FR-03.18, TS-14).",
          tags: ["fields"],
          operationId: "getFieldDeletion",
        },
      },
      async ({ params: { fieldId }, account }) => {
        const deletion = await readFieldDeletion(db, account.id, fieldId);
        if (!deletion) throw new ProblemError(404, "not_found", "This field doesn't exist.");
        return deletion;
      },
    )
    .get(
      "/fields/:fieldId/options/:optionId/removal",
      {
        signedIn: true,
        params: z.object({ fieldId: z.uuid(), optionId: z.uuid() }),
        response: {
          200: optionRemovalSchema,
          401: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Get what removing an option affects",
          description:
            "The albums choosing the option, active and in Trash, and the scope hash that confirms removing it from exactly them. `field.removeOption` needs that hash when any album chooses the option, and refuses it if the albums changed meanwhile (FR-03.17, TS-14).",
          tags: ["fields"],
          operationId: "getOptionRemoval",
        },
      },
      async ({ params: { fieldId, optionId }, account }) => {
        const removal = await readOptionRemoval(db, account.id, fieldId, optionId);
        if (!removal) throw new ProblemError(404, "not_found", "This option doesn't exist.");
        return removal;
      },
    );
}
