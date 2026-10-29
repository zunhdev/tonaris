// The CSP's connect-src (TS-101, TS-115): the API, and Sentry's exact ingest host only when errors are reported.

import { describe, expect, test } from "bun:test";

import { contentSecurityPolicy } from "./headers";

const connectSrc = (policy: string) =>
  policy.split("; ").find((each) => each.startsWith("connect-src"));

describe("contentSecurityPolicy", () => {
  test("connects to the API alone without a report host", () => {
    expect(
      connectSrc(contentSecurityPolicy({ nonce: "n", apiOrigin: "https://api.tonaris.app" })),
    ).toBe("connect-src 'self' https://api.tonaris.app");
  });

  test("adds the report host when errors are reported", () => {
    expect(
      connectSrc(
        contentSecurityPolicy({
          nonce: "n",
          apiOrigin: "https://api.tonaris.app",
          reportOrigin: "https://o1.ingest.de.sentry.io",
        }),
      ),
    ).toBe("connect-src 'self' https://api.tonaris.app https://o1.ingest.de.sentry.io");
  });
});
