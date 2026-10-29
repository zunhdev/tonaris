// A folder's or list's sharing, for its owner's dialog (DS-65; FR-07.1, FR-07.14): the open invitations, the link that
// is on with its URL, derived again from the server's secret each time (TS-32), and access inherited from folders
// above. Changes go through the sharing mutations. Anyone else's container answers 404, as if it didn't exist. Also
// the preview of what a move or a recovery would do to sharing (DS-69).

import { Elysia } from "elysia";
import { z } from "zod";

import { shareSettings, sharingImpact, type Database } from "@tonaris/db";
import {
  problemSchema,
  shareSettingsSchema,
  sharingImpactSchema,
  shareToken,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

/** The guest page a link's token opens (TS-32): `/s/` on the web app. */
export const shareUrl = (webOrigin: string, token: string) => `${webOrigin}/s/${token}`;

export function sharingRoutes(
  session: SessionGuard,
  { db, shareSecret, webOrigin }: { db: Database; shareSecret: string; webOrigin: string },
) {
  const impactQuery = z
    .object({
      move: z.uuid().optional().meta({ description: "The folder or list to move." }),
      recover: z.uuid().optional().meta({ description: "The Trash unit to recover." }),
      to: z
        .union([z.uuid(), z.literal("root")])
        .optional()
        .meta({
          description:
            "The destination folder, or `root`. A move needs it; a recovery defaults to where it was, and an album's ignores it.",
        }),
    })
    .refine((query) => (query.move === undefined) !== (query.recover === undefined), {
      message: "Give one of move and recover",
    })
    .refine((query) => query.recover !== undefined || query.to !== undefined, {
      message: "A move needs to",
      path: ["to"],
    });

  return new Elysia()
    .use(session)
    .get(
      "/sharing/impact",
      {
        signedIn: true,
        query: impactQuery,
        response: {
          200: sharingImpactSchema,
          401: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Preview a move's or a recovery's sharing consequences",
          description:
            "For the owner, before moving a folder or list or recovering a Trash unit (FR-07.9, FR-07.10, FR-07.14): the audiences it newly reaches, those it no longer reaches through the folders it leaves (never one another path keeps), and the direct shares on it and its contents. Changes nothing.",
          tags: ["sharing"],
          operationId: "previewSharingImpact",
        },
      },
      async ({ query, account }) => {
        const to = query.to === undefined ? undefined : query.to === "root" ? null : query.to;
        const impact = await sharingImpact(
          db,
          account.id,
          query.move === undefined
            ? { kind: "recover", unitId: query.recover ?? "", ...(to === undefined ? {} : { to }) }
            : { kind: "move", id: query.move, to: to ?? null },
        );
        if (impact === "not_found") {
          throw new ProblemError(404, "not_found", "This folder, list or album isn't available.");
        }
        if (impact === "invalid") {
          throw new ProblemError(422, "validation_failed", "It can't go there.");
        }
        return impact;
      },
    )
    .get(
      "/containers/:id/sharing",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        response: {
          200: shareSettingsSchema,
          401: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Get a folder's or list's sharing",
          description:
            "For its owner: the pending and accepted invitations, the link that is on (the same URL each time), and access from folders above it (DS-65). `share.invite` and `share.setLink` change it, in the app only (X-03).",
          tags: ["sharing"],
          operationId: "getSharing",
        },
      },
      async ({ params: { id }, account }) => {
        const settings = await shareSettings(db, account.id, id);
        if (!settings)
          throw new ProblemError(404, "not_found", "This folder or list doesn't exist.");
        const { link, ...rest } = settings;
        return {
          ...rest,
          link: link && {
            id: link.id,
            url: shareUrl(webOrigin, await shareToken(shareSecret, link.id)),
          },
        };
      },
    );
}
