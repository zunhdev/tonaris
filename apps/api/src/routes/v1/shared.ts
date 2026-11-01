// Shared with me (FR-07.13, FR-07.17; DS-67, DS-68, DS-70): the signed-in person's references with their owners, how
// each is shared, and whether it can be opened now; on a link's page, whether its collection is kept already; and a
// shared folder or list as its signed-in viewers see it, with a stream that says when to read it again. Saving and
// removing go through `share.saveLink` and `share.removeReference`; leaving through `share.leave`.

import { Elysia } from "elysia";
import { z } from "zod";

import {
  linkReferenceState,
  sharedOwner,
  sharedSnapshot,
  sharedWithMe,
  type Database,
} from "@tonaris/db";
import {
  linkReferenceStateSchema,
  problemSchema,
  sharedSnapshotSchema,
  sharedWithMeSchema,
  shareTokenSchema,
  unavailableLink,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { presentSnapshot, type ArtworkSigner } from "../../img/artwork";
import { ProblemError } from "../../problem";
import { invalidationStream } from "../../sse";
import type { SyncHub } from "../../sync/hub";

const token = shareTokenSchema.meta({ description: "The link's token." });

const unavailable = () =>
  new ProblemError(404, "not_found", "This folder or list isn't available to you anymore.");

export function sharedRoutes(
  session: SessionGuard,
  { db, hub, artwork }: { db: Database; hub: SyncHub; artwork: ArtworkSigner },
) {
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
      "/shared/:id",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        response: {
          200: sharedSnapshotSchema,
          401: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Get a folder or list shared with the person",
          description:
            "A folder or list the person may read through an accepted invitation or a link they keep (FR-07.11, FR-07.17), as its viewers see it: its active folders and lists, their albums with links, and only the fields those albums use. Anything else, their own content included, is `404`.",
          tags: ["sharing"],
          operationId: "getShared",
        },
      },
      async ({ params, account }) => {
        const snapshot = await sharedSnapshot(
          db,
          { kind: "person", userId: account.id },
          params.id,
        );
        if (!snapshot) throw unavailable();
        return presentSnapshot(artwork, snapshot);
      },
    )
    .get(
      "/shared/:id/stream",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        detail: {
          summary: "Stream a shared folder's or list's invalidations",
          description:
            "Server-sent `shared-invalidate` events (TS-23) whenever its owner saves a change, so the viewer's page reads it again; a read that fails means access ended. Comment lines keep the connection alive.",
          tags: ["sharing"],
          operationId: "streamShared",
          responses: {
            200: {
              description: "`shared-invalidate` events",
              content: {
                "text/event-stream": {
                  schema: { $ref: "#/components/schemas/SharedInvalidate" },
                },
              },
            },
            404: { description: "The folder or list isn't available to the person." },
          },
        },
      },
      async function* ({ params, account, request, server }) {
        const ownerId = await sharedOwner(db, { kind: "person", userId: account.id }, params.id);
        if (ownerId === undefined) throw unavailable();
        // The page follows its owner's writes.
        yield* invalidationStream(hub, { ownerId, rootId: params.id }, { request, server });
      },
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
