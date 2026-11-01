import { describe, expect, test } from "bun:test";

import { authorizeAdmissionAdmin, authorizeWrite, type OperationScope } from "./policies";
import type { Principal } from "./principals";

const owner = "owner-id";
const user: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const nativeApp: Principal = { ...user, client: "native" };
const otherUser: Principal = { kind: "user", userId: "someone-else", role: "user", client: "web" };
const creator: Principal = { kind: "user", userId: "creator-id", role: "creator", client: "web" };
const manage: Principal = { kind: "mcp", userId: owner, grantId: "g1", mode: "manage" };
const readOnly: Principal = { ...manage, mode: "read_only" };
const guest: Principal = { kind: "guest", linkId: "l1", rootId: "r1" };

const appOnly: Exclude<OperationScope, "collection" | "admission">[] = [
  "trash_purge",
  "sharing",
  "account",
  "connections",
];

describe("authorizeWrite (X-01, X-03, FR-10.3)", () => {
  test("owners change their own collection, from the web or a native app", () => {
    expect(authorizeWrite(user, { ownerId: owner, scope: "collection" })).toEqual({
      allowed: true,
    });
    expect(authorizeWrite(nativeApp, { ownerId: owner, scope: "collection" })).toEqual({
      allowed: true,
    });
  });

  test("nobody changes another person's collection, the creator included", () => {
    for (const principal of [otherUser, creator]) {
      expect(authorizeWrite(principal, { ownerId: owner, scope: "collection" })).toEqual({
        allowed: false,
        code: "permission_denied",
      });
    }
  });

  test("Manage-mode MCP writes its user's collection; Read-only writes nothing", () => {
    expect(authorizeWrite(manage, { ownerId: owner, scope: "collection" })).toEqual({
      allowed: true,
    });
    expect(authorizeWrite(readOnly, { ownerId: owner, scope: "collection" })).toEqual({
      allowed: false,
      code: "permission_denied",
    });
    expect(
      authorizeWrite(
        { ...manage, userId: "someone-else" },
        { ownerId: owner, scope: "collection" },
      ),
    ).toEqual({ allowed: false, code: "permission_denied" });
  });

  test.each(appOnly)(
    "%s is app-only: MCP is refused in any mode, the owner's app is not",
    (scope) => {
      for (const principal of [manage, readOnly]) {
        expect(authorizeWrite(principal, { ownerId: owner, scope })).toEqual({
          allowed: false,
          code: "app_only",
        });
      }
      expect(authorizeWrite(user, { ownerId: owner, scope })).toEqual({ allowed: true });
    },
  );

  test("guests never write", () => {
    expect(authorizeWrite(guest, { ownerId: owner, scope: "collection" })).toEqual({
      allowed: false,
      code: "permission_denied",
    });
  });
});

describe("authorizeAdmissionAdmin (FR-11.6, X-03)", () => {
  test("only the creator, and only in the app", () => {
    expect(authorizeAdmissionAdmin(creator)).toEqual({ allowed: true });
    expect(authorizeAdmissionAdmin(user)).toEqual({ allowed: false, code: "permission_denied" });
    expect(
      authorizeAdmissionAdmin({ kind: "mcp", userId: "creator-id", grantId: "g", mode: "manage" }),
    ).toEqual({
      allowed: false,
      code: "app_only",
    });
    expect(authorizeAdmissionAdmin(guest)).toEqual({ allowed: false, code: "permission_denied" });
  });
});
