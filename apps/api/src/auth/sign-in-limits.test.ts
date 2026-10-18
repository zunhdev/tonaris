import { describe, expect, test } from "bun:test";

import { createSignInLimiter, signInLimits } from "./sign-in-limits";

const minute = 60_000;

function clock(start = Date.UTC(2026, 9, 18, 12)) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("sign-in limits (TS-104)", () => {
  test("are the approved values", () => {
    expect(signInLimits).toEqual({
      perEmail: { max: 5, windowMs: 15 * minute },
      perIp: { max: 20, windowMs: 15 * minute },
    });
  });

  test("allow 5 code requests per email in 15 minutes, then say how long to wait", () => {
    const time = clock();
    const limiter = createSignInLimiter(signInLimits, time.now);
    for (let i = 0; i < 5; i++) {
      expect(limiter.codeRequest("anna@example.com", undefined)).toBeUndefined();
      time.advance(minute);
    }
    // The first request was 5 minutes ago, so it leaves the window in 10.
    expect(limiter.codeRequest("anna@example.com", undefined)).toBe(600);
    expect(limiter.codeRequest("ben@example.com", undefined)).toBeUndefined();

    time.advance(10 * minute);
    expect(limiter.codeRequest("anna@example.com", undefined)).toBeUndefined();
  });

  test("count requests and submissions together per address", () => {
    const time = clock();
    const limiter = createSignInLimiter(signInLimits, time.now);
    for (let i = 0; i < 10; i++) {
      expect(limiter.codeRequest(`p${i}@example.com`, "203.0.113.7")).toBeUndefined();
      expect(limiter.codeSubmission("203.0.113.7")).toBeUndefined();
    }
    expect(limiter.codeSubmission("203.0.113.7")).toBe(900);
    expect(limiter.codeRequest("new@example.com", "203.0.113.7")).toBe(900);
    expect(limiter.codeSubmission("198.51.100.1")).toBeUndefined();
  });

  test("a refused request counts nothing", () => {
    const time = clock();
    const limiter = createSignInLimiter(
      { perEmail: { max: 5, windowMs: 15 * minute }, perIp: { max: 1, windowMs: 15 * minute } },
      time.now,
    );
    expect(limiter.codeRequest("anna@example.com", "203.0.113.7")).toBeUndefined();
    // Refused by the address limit, so the email's count stays at one.
    for (let i = 0; i < 6; i++)
      expect(limiter.codeRequest("anna@example.com", "203.0.113.7")).toBe(900);
    for (let i = 0; i < 4; i++) {
      expect(limiter.codeRequest("anna@example.com", `198.51.100.${i}`)).toBeUndefined();
    }
    expect(limiter.codeRequest("anna@example.com", "198.51.100.9")).toBe(900);
  });

  test("requests without a known address are limited by email only", () => {
    const limiter = createSignInLimiter();
    for (let i = 0; i < 30; i++) expect(limiter.codeSubmission(undefined)).toBeUndefined();
  });
});
