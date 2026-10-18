// Who is acting (TS-30). Every command and query takes a principal; authorization lives in policies.ts.

/** MCP permission modes, chosen per connection (FR-10.3). */
export const mcpModes = ["read_only", "manage"] as const;
export type McpMode = (typeof mcpModes)[number];

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
