// Shared with me (FR-07.13; DS-67, DS-68): the signed-in person's references with their owners, how each is shared,
// and whether it can be opened now; and, on a link's page, whether its collection is kept already. Saving and
// removing go through `share.saveLink` and `share.removeReference`; leaving through `share.leave`.

import { Elysia } from "elysia";
import { z } from "zod";

import { linkReferenceState, sharedWithMe, type Database } from "@tonaris/db";
import {
  linkReferenceStateSchema,
  problemSchema,
  sharedWithMeSchema,
  unavailableLink,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

const token = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .meta({ description: "The link's token." });

export function sharedRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .get(
      "/shared",
      {
        signedIn: true,
        response: { 200: sharedWithMeSchema, 401: problemSchema },
        detail: {
          summary: "List Shared with me",
          description:
            "The folders and lists the person keeps (FR-07.13): each with its owner's display name, whether an accepted invitation or a working link shares it, and whether it can be opened now. Names show only while it can.",
          tags: ["sharing"],
          operationId: "listShared",
        },
      },
      async ({ account }) => ({ entries: await sharedWithMe(db, account.id) }),
    )
    .get(
      "/s/:token/reference",
      {
        signedIn: true,
        params: z.object({ token }),
        response: {
          200: linkReferenceStateSchema,
          401: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Get whether a link is in Shared with me",
          description:
            "For a signed-in visitor of a link's page (DS-68): whether its folder or list is in their Shared with me, and whether it is their own. Opening a link adds nothing; `share.saveLink` does.",
          tags: ["sharing"],
          operationId: "getLinkReference",
        },
      },
      async ({ params, account }) => {
        const state = await linkReferenceState(db, account.id, params.token);
        if (!state) throw new ProblemError(404, "not_found", unavailableLink);
        return state;
      },
    );
}
