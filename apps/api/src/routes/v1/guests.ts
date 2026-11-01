// A shared link, for anyone holding it (DS-72; FR-07.1, FR-07.11, FR-11.9; TS-23, TS-32): the shared folder or list
// as its guests see it, and a stream that says when to read it again. No session: the token in the path is the
// credential, found by its hash. Every way a link can fail answers the same, so nothing is revealed about the
// content. Tokens appear only on `/v1/s/` paths, and the error log hides them (problem.ts).

import { Elysia } from "elysia";
import { z } from "zod";

import { findShareLink, sharedSnapshot, type Database } from "@tonaris/db";
import {
  problemSchema,
  sharedSnapshotSchema,
  shareTokenSchema,
  unavailableLink,
} from "@tonaris/domain";

import { presentSnapshot, type ArtworkSigner } from "../../img/artwork";
import { invalidationEvents, streamResponses } from "../../openapi";
import { ProblemError } from "../../problem";
import { invalidationStream } from "../../sse";
import type { SyncHub } from "../../sync/hub";

const token = shareTokenSchema.meta({ description: "The link's token (TS-32)." });

const unavailable = () => new ProblemError(404, "not_found", unavailableLink);

export function guestRoutes({
  db,
  hub,
  artwork,
}: {
  db: Database;
  hub: SyncHub;
  artwork: ArtworkSigner;
}) {
  /** The link and its owner, while the link works: live, and its folder or list readable (not in Trash). */
  async function working(value: string) {
    const link = await findShareLink(db, value);
    if (!link) throw unavailable();
    const snapshot = await sharedSnapshot(db, { kind: "link", linkId: link.id }, link.containerId);
    if (!snapshot) throw unavailable();
    return { link, snapshot };
  }

  return new Elysia()
    .get(
      "/s/:token",
      {
        params: z.object({ token }),
        response: { 200: sharedSnapshotSchema, 404: problemSchema, 422: problemSchema },
        detail: {
          summary: "Get a shared link's content",
          description:
            "The folder or list a link shares, as its guests see it (FR-07.11, FR-07.12): its active folders and lists, their albums with links, and only the fields those albums use. No session is needed. An unknown, turned-off or suspended link is `404`, whatever the reason (DS-72).",
          tags: ["sharing"],
          operationId: "getSharedLink",
        },
      },
      async ({ params }) => {
        const { snapshot } = await working(params.token);
        // Its artwork shows through the API's image proxy (TS-103).
        return presentSnapshot(artwork, snapshot);
      },
    )
    .get(
      "/s/:token/stream",
      {
        params: z.object({ token }),
        detail: {
          summary: "Stream a shared link's invalidations",
          description:
            "Server-sent `shared-invalidate` events (TS-23) whenever the owner saves a change, so the guest page reads the link again; a read that fails means the link stopped working. Comment lines keep the connection alive.",
          tags: ["sharing"],
          operationId: "streamSharedLink",
          responses: streamResponses(invalidationEvents, [404, 422]),
        },
      },
      async function* ({ params, request, server }) {
        const { link } = await working(params.token);
        // The page follows its owner's writes.
        yield* invalidationStream(
          hub,
          { ownerId: link.ownerId, rootId: link.containerId },
          { request, server },
        );
      },
    );
}
