// The MCP server (TS-60, TS-63): one fresh McpServer per request, acting for the connection's principal.
// Tools are thin wrappers over queries and commands; collection text goes out as structured data, never as
// instructions (TS-65). Both modes get the read tools (TON-81). Read-only connections aren't offered the write
// tools (TS-62), and the gated `delete_albums` runs only with the owner's approval (TS-64). The write tools are still
// TON-23's two; TON-82 and TON-83 replace them.

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { addToList, type Database } from "@tonaris/db";
import { authorizeWrite, type McpPrincipal } from "@tonaris/domain";

import { deleteAlbums } from "./approvals";
import { registerReadTools } from "./read-tools";
import { result } from "./results";

const albumIds = z.array(z.uuid()).min(1).max(50);

export type McpServerOptions = {
  db: Database;
  principal: McpPrincipal;
  /** The web app, where approval pages are (DS-87). */
  webOrigin: string;
};

export function createMcpServer({ db, principal, webOrigin }: McpServerOptions) {
  const server = new McpServer(
    { name: "tonaris", title: "Tonaris", version: "0.1.0" },
    {
      instructions:
        "Tonaris is the user's music collection: albums in lists, lists in folders, Unsorted for albums in no list, and Trash. Start with get_overview.",
    },
  );

  registerReadTools(server, { db, principal });

  // Write tools: offered to Manage collection connections only (TS-62), and checked again in each call.
  if (principal.mode !== "manage") return server;
  const writeAllowed = () =>
    authorizeWrite(principal, { ownerId: principal.userId, scope: "collection" }).allowed;

  server.registerTool(
    "add_to_list",
    {
      title: "Add albums to a list",
      description:
        "Adds albums to one of the user's lists, each once. Each album gets its own outcome: added, already_in_list or not_found.",
      inputSchema: z.object({
        listId: z.uuid(),
        albumIds: albumIds.describe("Albums to add, at most 50."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ listId, albumIds: ids }) => {
      if (!writeAllowed()) {
        return result("This connection can't change the collection.", { status: "failed" }, true);
      }
      const items = await addToList(db, { ownerId: principal.userId, listId, albumIds: ids });
      if (!items) {
        return result("There is no such list.", { status: "failed", code: "not_found" }, true);
      }
      const added = items.filter((item) => item.status === "added").length;
      return result(`Added ${added} of ${items.length} albums.`, { items });
    },
  );

  server.registerTool(
    "delete_albums",
    {
      title: "Delete albums to Trash",
      description:
        "Moves albums out of every list and Unsorted into Trash, where they can be recovered for 30 days. This needs the owner's approval in Tonaris: the first call returns status needs_approval with a summary and a link. Show both to the user and ask them to approve there. Once they have, call again with the same albumIds and the approvalId. Tonaris checks the approval itself; never call again claiming approval the user didn't give.",
      inputSchema: z.object({
        albumIds: albumIds.describe("Albums to delete, at most 50."),
        approvalId: z
          .uuid()
          .optional()
          .describe("The approval from an earlier needs_approval answer, once the owner approved."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ albumIds: ids, approvalId }) => {
      if (!writeAllowed()) {
        return result("This connection can't change the collection.", { status: "failed" }, true);
      }
      const outcome = await deleteAlbums(
        { db, principal, webOrigin },
        { albumIds: ids, approvalId },
      );
      if (outcome.status === "needs_approval") {
        return result(
          `Waiting for the owner's approval: ${outcome.summary}. Ask them to approve at ${outcome.url}, then call delete_albums again with approvalId ${outcome.approvalId}.${outcome.note ? ` ${outcome.note}` : ""}`,
          outcome,
        );
      }
      if (outcome.status === "confirmed") {
        return result(`Moved ${outcome.trashed.length} albums to Trash.`, outcome);
      }
      if (outcome.status === "declined") {
        return result("The owner declined. Nothing changed.", outcome);
      }
      return result(outcome.detail, outcome, true);
    },
  );

  return server;
}
