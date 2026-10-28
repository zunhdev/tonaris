// What removing an option affects, for its confirmation (FR-03.17, TS-14, DS-60): the field, the option, the albums
// choosing it, active and in Trash, and the hash that confirms exactly that scope to `field.removeOption`. Another
// account's field is answered as missing, so nobody can probe for other people's IDs.

import { Elysia } from "elysia";
import { z } from "zod";

import { readOptionRemoval, type Database } from "@tonaris/db";
import { optionRemovalSchema, problemSchema } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

export function fieldRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia().use(session).get(
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
