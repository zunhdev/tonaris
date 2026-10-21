import { describe, expect, test } from "bun:test";

import { mcpModeOf, mcpScopes, mcpScopesFor } from "./principals";

const both = [mcpScopes.read, mcpScopes.manage, "offline_access"];

describe("MCP modes as OAuth scopes (FR-10.3, TS-61)", () => {
  test("Read-only grants the read scope alone; Manage grants both", () => {
    expect(mcpScopesFor("read_only", both)).toEqual([mcpScopes.read, "offline_access"]);
    expect(mcpScopesFor("manage", both)).toEqual(both);
  });

  test("a mode never grants a scope the client didn't ask for", () => {
    expect(mcpScopesFor("manage", [mcpScopes.read])).toEqual([mcpScopes.read]);
  });

  test("granted scopes read back as the mode", () => {
    expect(mcpModeOf(mcpScopesFor("read_only", both))).toBe("read_only");
    expect(mcpModeOf(mcpScopesFor("manage", both))).toBe("manage");
  });

  test("without the read scope there is no mode, even with the manage scope", () => {
    expect(mcpModeOf([])).toBeUndefined();
    expect(mcpModeOf(["offline_access"])).toBeUndefined();
    expect(mcpModeOf([mcpScopes.manage])).toBeUndefined();
  });
});
