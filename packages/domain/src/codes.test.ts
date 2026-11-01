// One-time codes (TS-70, TS-73): expired at their expiry, locked after the last wrong try, and tried otherwise.

import { describe, expect, test } from "bun:test";

import { signInCode } from "./accounts";
import { codeRefusal } from "./codes";

describe("one-time codes (TS-70, TS-73)", () => {
  const now = new Date(Date.UTC(2026, 10, 1, 12, 0, 0));
  const later = new Date(now.getTime() + 60_000);

  test("a code can be tried until it expires, at its expiry included", () => {
    expect(codeRefusal({ expiresAt: later, attempts: 0 }, now)).toBeUndefined();
    expect(codeRefusal({ expiresAt: now, attempts: 0 }, now)).toBe("expired");
  });

  test("it is locked once its wrong tries reach the limit; expiry is told first", () => {
    const last = signInCode.attempts - 1;
    expect(codeRefusal({ expiresAt: later, attempts: last }, now)).toBeUndefined();
    expect(codeRefusal({ expiresAt: later, attempts: signInCode.attempts }, now)).toBe("locked");
    expect(codeRefusal({ expiresAt: now, attempts: signInCode.attempts }, now)).toBe("expired");
  });
});
