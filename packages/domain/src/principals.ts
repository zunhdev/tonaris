// Who is acting (TS-30). Every command and query takes a principal; authorization lives in policies.ts.
// MCP principals act through a connection, whose mode is stored as OAuth scopes (TS-61).

import { z } from "./zod";

/** MCP permission modes, chosen per connection (FR-10.3). */
export const mcpModes = ["read_only", "manage"] as const;
export type McpMode = (typeof mcpModes)[number];

/**
 * The OAuth scopes a connection's mode is stored as (TS-61). Clients ask for both; the consent page grants
 * `collection:read` alone for Read-only, and both for Manage collection.
 */
export const mcpScopes = { read: "collection:read", manage: "collection:manage" } as const;

/** The mode `scopes` grant, or nothing when they don't grant reading the collection. */
export function mcpModeOf(scopes: readonly string[]): McpMode | undefined {
  if (!scopes.includes(mcpScopes.read)) return undefined;
  return scopes.includes(mcpScopes.manage) ? "manage" : "read_only";
}

/** The scopes to grant for `mode`, out of those the client asked for (TS-61). */
export function mcpScopesFor(mode: McpMode, requested: readonly string[]): string[] {
  return requested.filter((scope) => mode === "manage" || scope !== mcpScopes.manage);
}

/** An MCP connection as Settings lists it (DS-86, `GET /v1/connections`). */
export const connectionSchema = z
  .object({
    id: z.uuid(),
    clientName: z
      .string()
      .nullable()
      .meta({ description: "The name the client gave itself, if any (DS-85)." }),
    clientId: z.string().meta({ description: "The client's ID: a URL for CIMD clients." }),
    mode: z
      .enum(mcpModes)
      .nullable()
      .meta({ description: "What the connection may do; null if it was granted no access." }),
    connectedAt: z.iso.datetime(),
  })
  .meta({ description: "An AI client connected through MCP (FR-10.3)." });
export type Connection = z.infer<typeof connectionSchema>;

export type Principal =
  /**
   * A signed-in person: the web app with its session cookie, or a native app with an OAuth token. Both
   * have the same rights. `creator` adds admission administration, never access to others' data.
   */
  | { kind: "user"; userId: string; role: "creator" | "user"; client: "web" | "native" }
  /** An AI client connected through MCP, acting for `userId` within the grant's mode. */
  | { kind: "mcp"; userId: string; grantId: string; mode: McpMode }
  /** Someone holding a share link: read access to one shared root and its subtree only. */
  | { kind: "guest"; linkId: string; rootId: string };

/** The account a principal acts for, if any: guests act for nobody. */
export function actingUserId(principal: Principal): string | undefined {
  return principal.kind === "guest" ? undefined : principal.userId;
}
