import { describe, expect, test } from "bun:test";

import { databaseUrl, testDatabaseUrl } from "./config";

describe("databaseUrl", () => {
  test("uses DATABASE_URL when set", () => {
    expect(
      databaseUrl({ DATABASE_URL: "postgres://app@db:5432/tonaris", NODE_ENV: "production" }),
    ).toBe("postgres://app@db:5432/tonaris");
  });

  test("falls back to the local database outside production", () => {
    expect(databaseUrl({})).toBe("postgres://postgres@localhost:5432/tonaris");
  });

  test("refuses to guess in production", () => {
    expect(() => databaseUrl({ NODE_ENV: "production" })).toThrow("DATABASE_URL must be set");
  });
});

describe("testDatabaseUrl", () => {
  test("uses TEST_DATABASE_URL, else the local test database", () => {
    expect(testDatabaseUrl({ TEST_DATABASE_URL: "postgres://ci@localhost/test" })).toBe(
      "postgres://ci@localhost/test",
    );
    expect(testDatabaseUrl({})).toBe("postgres://postgres@localhost:5432/tonaris_test");
  });
});
