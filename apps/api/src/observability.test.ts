// The API's logs and error reports (TS-115): JSON lines and Sentry events carry no token, cookie, code, email or
// request body.

import { describe, expect, spyOn, test } from "bun:test";

import type { ErrorEvent } from "@sentry/bun";

import { log, scrubBreadcrumb, scrubEvent } from "./observability";

describe("log", () => {
  test("writes one redacted JSON line", () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      log("error", "Sending failed for anna@example.com", { token: "abc", detail: "Bearer xyz" });
      const line = JSON.parse(String(errors.mock.calls[0]?.[0]));
      expect(line).toMatchObject({
        level: "error",
        message: "Sending failed for [email]",
        token: "[redacted]",
        detail: "Bearer [redacted]",
      });
      expect(line.time).toBeString();
    } finally {
      errors.mockRestore();
    }
  });
});

describe("scrubEvent", () => {
  test("drops the request's body, cookies, headers and query and the user, and redacts the rest", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "Couldn't email ben@example.com",
      request: {
        url: "https://api.tonaris.app/v1/s/Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE?code=123456",
        data: { title: "Kind of Blue" },
        cookies: { "__Secure-tonaris.session_token": "secret" },
        headers: { authorization: "Bearer abc" },
        query_string: "code=123456",
      },
      user: { id: "u1", email: "anna@example.com", ip_address: "203.0.113.9" },
      exception: {
        values: [
          {
            type: "Error",
            value: "Token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4 expired",
          },
        ],
      },
      extra: { email: "anna@example.com", count: 2 },
    };
    expect(scrubEvent(event)).toEqual({
      type: undefined,
      message: "Couldn't email [email]",
      request: { url: "https://api.tonaris.app/v1/s/[token]?code=[redacted]" },
      exception: { values: [{ type: "Error", value: "Token [jwt] expired" }] },
      extra: { email: "[redacted]", count: 2 },
    });
  });

  test("redacts breadcrumbs", () => {
    expect(
      scrubBreadcrumb({
        message: "GET /join/abcdefghijklmnopqrstuvwxyz",
        data: { url: "/recover/abcdefghijklmnopqrstu" },
      }),
    ).toEqual({ message: "GET /join/[token]", data: { url: "/recover/[token]" } });
  });
});
