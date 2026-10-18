import { describe, expect, test } from "bun:test";

import { apiConfig } from "./config";

const production = {
  NODE_ENV: "production",
  API_ORIGIN: "https://api.tonaris.example",
  WEB_ORIGIN: "https://tonaris.example",
  BETTER_AUTH_SECRET: "a-production-secret",
  SMTP_URL: "smtps://user:pass@smtp.example:465",
  EMAIL_FROM: "Tonaris <no-reply@tonaris.example>",
};

describe("apiConfig", () => {
  test("runs locally on defaults (TS-06)", () => {
    const config = apiConfig({});
    expect(config).toMatchObject({
      port: 3001,
      apiOrigin: "http://localhost:3001",
      webOrigin: "http://localhost:3000",
      smtpUrl: "smtp://localhost:1025",
      clientIpHeader: undefined,
    });
    // A host-only localhost cookie reaches both ports.
    expect(config.cookieDomain).toBeUndefined();
  });

  test("requires every origin and secret in production (TS-105)", () => {
    expect(() => apiConfig({ NODE_ENV: "production" })).toThrow(
      "Set API_ORIGIN, WEB_ORIGIN, BETTER_AUTH_SECRET, SMTP_URL, EMAIL_FROM in production",
    );
    const { BETTER_AUTH_SECRET: _, ...withoutSecret } = production;
    expect(() => apiConfig(withoutSecret)).toThrow("Set BETTER_AUTH_SECRET in production");
  });

  test("scopes the cookie to the web app's host, the parent of the API's (TS-08)", () => {
    const config = apiConfig(production);
    expect(config.cookieDomain).toBe("tonaris.example");
    expect(config.authSecret).toBe("a-production-secret");
  });

  test("refuses an API host outside the cookie's domain", () => {
    expect(() => apiConfig({ ...production, API_ORIGIN: "https://api.elsewhere.example" })).toThrow(
      "must be a subdomain",
    );
  });

  test("accepts origins only, and HTTPS in production", () => {
    expect(apiConfig({ WEB_ORIGIN: "http://localhost:3100/" }).webOrigin).toBe(
      "http://localhost:3100",
    );
    expect(() => apiConfig({ WEB_ORIGIN: "http://localhost:3000/app" })).toThrow("origin only");
    expect(() => apiConfig({ WEB_ORIGIN: "tonaris" })).toThrow("must be an origin");
    expect(() => apiConfig({ ...production, WEB_ORIGIN: "http://tonaris.example" })).toThrow(
      "https in production",
    );
  });

  test("no cookie domain for an IP address", () => {
    expect(
      apiConfig({ WEB_ORIGIN: "http://127.0.0.1:3000", API_ORIGIN: "http://127.0.0.1:3001" })
        .cookieDomain,
    ).toBeUndefined();
  });

  test("reads the proxy's client-address header in lower case", () => {
    expect(apiConfig({ CLIENT_IP_HEADER: "X-Forwarded-For" }).clientIpHeader).toBe(
      "x-forwarded-for",
    );
  });
});
