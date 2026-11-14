// What may leave in logs and error reports (TS-115): tokens, secrets, cookies, codes and emails never do.

import { describe, expect, test } from "bun:test";

import { redact, redactText } from "./telemetry";

describe("redactText", () => {
  test("replaces bearer tokens, JWTs, emails, path tokens and token-like query values", () => {
    expect(
      redactText(
        "Bearer abc.def-123 for anna@example.com at /s/Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE?code=123456&page=2, eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4",
      ),
    ).toBe("Bearer [redacted] for [email] at /s/[token]?code=[redacted]&page=2, [jwt]");
  });

  test("replaces percent-encoded emails and codes after # in the sign-in and join links", () => {
    expect(
      redactText(
        "https://tonaris.app/sign-in/verify?email=anna%2Btag%40example.com&redirect=%2Fc#code=123456",
      ),
    ).toBe("https://tonaris.app/sign-in/verify?email=[email]&redirect=%2Fc#code=[redacted]");
    expect(redactText("/join/abc#code=123456")).toBe("/join/abc#code=[redacted]");
  });

  test("leaves IDs and ordinary text as they are", () => {
    const text = "Album 01a189cf-b245-739e-8bea-db457b4d59c4 couldn't be saved";
    expect(redactText(text)).toBe(text);
  });
});

describe("redact", () => {
  test("replaces sensitive keys' values and redacts strings, however deep", () => {
    expect(
      redact({
        headers: { authorization: "Bearer x", cookie: "a=b", accept: "*/*" },
        user: { email: "anna@example.com", id: "u1" },
        nested: [{ token: "t", note: "write to ben@example.com" }],
        code: "123456",
      }),
    ).toEqual({
      headers: { authorization: "[redacted]", cookie: "[redacted]", accept: "*/*" },
      user: { email: "[redacted]", id: "u1" },
      nested: [{ token: "[redacted]", note: "write to [email]" }],
      code: "[redacted]",
    });
  });
});
