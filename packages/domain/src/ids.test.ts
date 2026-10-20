import { describe, expect, test } from "bun:test";

import { uuidv7, uuidv7Time } from "./ids";
import { z } from "./zod";

describe("UUIDv7 (TS-10)", () => {
  test("makes valid, distinct version 7 UUIDs", () => {
    const ids = Array.from({ length: 1_000 }, () => uuidv7());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(z.uuid({ version: "v7" }).safeParse(id).success).toBe(true);
  });

  test("carries its creation time, as Bun's own UUIDv7 does", () => {
    const at = Date.UTC(2026, 9, 20, 12, 30, 15, 123);
    expect(uuidv7Time(uuidv7(at))).toBe(at);
    const before = Date.now();
    const bun = Bun.randomUUIDv7();
    expect(uuidv7Time(bun)).toBeGreaterThanOrEqual(before);
    expect(uuidv7Time(bun)).toBeLessThanOrEqual(Date.now());
  });

  test("sorts by time as text", () => {
    const earlier = uuidv7(1_000_000);
    const later = uuidv7(1_000_001);
    expect(earlier < later).toBe(true);
  });

  test("has no time for other UUIDs or strings", () => {
    expect(uuidv7Time(crypto.randomUUID())).toBeUndefined();
    expect(uuidv7Time("not-a-uuid")).toBeUndefined();
  });
});
