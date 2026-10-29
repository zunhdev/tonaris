// Settings → Connections (FR-10.3, DS-86, TS-61): the signed-in account's MCP connections, and revoking one.
// App-only (X-03): the routes take the session cookie, and MCP tokens never reach /v1 (TS-62).

import { Elysia } from "elysia";
import { z } from "zod";

import { listConnections, revokeConnection, type Database } from "@tonaris/db";
import { connectionSchema, mcpModeOf, problemSchema } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

export function connectionRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .get(
      "/connections",
      {
        signedIn: true,
        response: { 200: z.array(connectionSchema), 401: problemSchema },
        detail: {
          summary: "List MCP connections",
          description:
            "The AI clients connected to this account, newest first, with their mode and when each last called.",
          tags: ["connections"],
          operationId: "listConnections",
        },
      },
      async ({ account }) => {
        const connections = await listConnections(db, account.id);
        return connections.map((connection) => ({
          id: connection.id,
          clientName: connection.clientName,
          clientId: connection.clientId,
          mode: mcpModeOf(connection.scopes) ?? null,
          connectedAt: connection.createdAt.toISOString(),
          lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
        }));
      },
    )
    .delete(
      "/connections/:id",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        response: {
          // Elysia sends a 204 without a body, so validation sees undefined; the document shows no content.
          204: z.null().optional().meta({ description: "The connection is revoked." }),
          401: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Revoke an MCP connection",
          description:
            "Disconnects the client: its tokens stop working at once, and reconnecting asks for consent again.",
          tags: ["connections"],
          operationId: "revokeConnection",
        },
      },
      async ({ params, account, status }) => {
        if (!(await revokeConnection(db, { userId: account.id, id: params.id }))) {
          throw new ProblemError(404, "not_found", "No connection with this ID.");
        }
        return status(204, null);
      },
    );
}
