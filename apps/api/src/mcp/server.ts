// The MCP server (TS-60, TS-63): one fresh McpServer per request, acting for the connection's principal.
// Tools are thin wrappers over queries and commands; collection text goes out as structured data, never as
// instructions (TS-65). Both modes get the read tools (TON-81). Read-only connections aren't offered the write
// tools (TS-62). The ordinary write tools run the app's own commands (TON-82), and the gated ones run them only with
// the owner's approval of exactly what they do (TS-64, TON-83).

import { McpServer } from "@modelcontextprotocol/server";

import type { Database } from "@tonaris/db";
import type { McpPrincipal } from "@tonaris/domain";

import { registerGatedTools } from "./gated-tools";
import { withRateLimits, type McpLimiter } from "./limits";
import { registerReadTools } from "./read-tools";
import { registerWriteTools } from "./write-tools";
import type { McpWriter } from "./writes";

export type McpServerOptions = {
  db: Database;
  principal: McpPrincipal;
  /** The connection's read and write budgets (TS-66). */
  limiter: McpLimiter;
  /** Runs the write tools' changes as the app's own mutations (TON-82, TON-83). */
  writer: McpWriter;
  /** The web app, where approval pages are (DS-87). */
  webOrigin: string;
};

export function createMcpServer({ db, principal, limiter, writer, webOrigin }: McpServerOptions) {
  const unlimited = new McpServer(
    { name: "tonaris", title: "Tonaris", version: "0.1.0" },
    {
      instructions:
        "Tonaris is the user's music collection: albums in lists, lists in folders, Unsorted for albums in no list, and Trash. Start with get_overview.",
    },
  );
  // Every tool takes a call from the connection's budget first (TS-66).
  const server = withRateLimits(unlimited, (kind) => limiter.take(principal.grantId, kind));

  registerReadTools(server, { db, principal });

  // Write tools: offered to Manage collection connections only (TS-62); every command checks the mode again.
  if (principal.mode !== "manage") return unlimited;
  registerWriteTools(server, { db, principal, writer });
  registerGatedTools(server, { db, principal, writer, webOrigin });
  return unlimited;
}
