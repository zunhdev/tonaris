// Sharing invitations from their recipient's side (FR-07.5, FR-07.6; DS-66): the inbox of pending invitations, and
// one invitation's state for the page its email links to. Answering goes through `share.accept` and `share.decline`.
// Someone else's invitation shows as theirs, with nothing about it; anything else not available shows as unavailable.

import { Elysia } from "elysia";
import { z } from "zod";

import { invitationState, pendingInvitations, type Database } from "@tonaris/db";
import { invitationListSchema, invitationStateSchema, problemSchema } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";

export function invitationRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .get(
      "/invitations",
      {
        signedIn: true,
        response: { 200: invitationListSchema, 401: problemSchema },
        detail: {
          summary: "List pending invitations",
          description:
            "The signed-in person's pending invitations to view folders and lists, oldest first, leaving out those whose collection is in Trash (DS-66). `share.accept` and `share.decline` answer them, in the app (X-03).",
          tags: ["sharing"],
          operationId: "listInvitations",
        },
      },
      async ({ account }) => ({ invitations: await pendingInvitations(db, account.id) }),
    )
    .get(
      "/invitations/:id",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        response: { 200: invitationStateSchema, 401: problemSchema, 422: problemSchema },
        detail: {
          summary: "Get an invitation",
          description:
            "For the page an invitation's email links to (DS-66): `pending` or `accepted` with the invitation for its recipient; `wrong_account`, with nothing about it, for anyone else while it is pending; otherwise `unavailable`.",
          tags: ["sharing"],
          operationId: "getInvitation",
        },
      },
      ({ params: { id }, account }) => invitationState(db, account.id, id),
    );
}
