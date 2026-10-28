// A folder's or list's sharing, for its owner's dialog (DS-65; FR-07.1, FR-07.14): the open invitations, the link that
// is on with its URL, derived again from the server's secret each time (TS-32), and access inherited from folders
// above. Changes go through the sharing mutations. Anyone else's container answers 404, as if it didn't exist.

import { Elysia } from "elysia";
import { z } from "zod";

import { shareSettings, type Database } from "@tonaris/db";
import { problemSchema, shareSettingsSchema, shareToken } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

/** The guest page a link's token opens (TS-32): `/s/` on the web app. */
export const shareUrl = (webOrigin: string, token: string) => `${webOrigin}/s/${token}`;

export function sharingRoutes(
  session: SessionGuard,
  { db, shareSecret, webOrigin }: { db: Database; shareSecret: string; webOrigin: string },
) {
  return new Elysia().use(session).get(
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
      if (!settings) throw new ProblemError(404, "not_found", "This folder or list doesn't exist.");
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
