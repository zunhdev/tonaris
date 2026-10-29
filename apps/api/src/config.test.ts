import { describe, expect, test } from "bun:test";

import { apiConfig } from "./config";

const production = {
  NODE_ENV: "production",
  API_ORIGIN: "https://api.tonaris.example",
  WEB_ORIGIN: "https://tonaris.example",
  BETTER_AUTH_SECRET: "a-production-secret",
  SMTP_URL: "smtps://user:pass@smtp.example:465",
  EMAIL_FROM: "Tonaris <no-reply@tonaris.example>",
  SUPPORT_EMAIL: "help@tonaris.example",
  LEDGER_URL: "s3://tonaris-ledger/events",
};

describe("apiConfig", () => {
  test("runs locally on defaults (TS-06)", () => {
    const config = apiConfig({});
    expect(config).toMatchObject({
      port: 3001,
      apiOrigin: "http://localhost:3001",
      webOrigin: "http://localhost:3000",
      smtpUrl: "smtp://localhost:1025",
      supportEmail: "support@tonaris.test",
      clientIpHeader: undefined,
    });
    // The ledger's local default, a directory beside the API.
    expect(config.ledgerUrl).toMatch(/^file:\/\/.*\/\.ledger$/);
    // A host-only localhost cookie reaches both ports.
    expect(config.cookieDomain).toBeUndefined();
  });

  test("requires every origin and secret in production (TS-105)", () => {
    expect(() => apiConfig({ NODE_ENV: "production" })).toThrow(
      "Set API_ORIGIN, WEB_ORIGIN, BETTER_AUTH_SECRET, EMAIL_FROM, SUPPORT_EMAIL, LEDGER_URL, RESEND_API_KEY (or SMTP_URL) in production",
    );
    const { BETTER_AUTH_SECRET: _, ...withoutSecret } = production;
    expect(() => apiConfig(withoutSecret)).toThrow("Set BETTER_AUTH_SECRET in production");
    // The help page's address (TS-73).
    const { SUPPORT_EMAIL: __, ...withoutSupport } = production;
    expect(() => apiConfig(withoutSupport)).toThrow("Set SUPPORT_EMAIL in production");
    expect(apiConfig(production).supportEmail).toBe("help@tonaris.example");
    // The revocation ledger must be off-site (TS-113): no local default in production.
    const { LEDGER_URL: ___, ...withoutLedger } = production;
    expect(() => apiConfig(withoutLedger)).toThrow("Set LEDGER_URL in production");
    expect(apiConfig(production).ledgerUrl).toBe("s3://tonaris-ledger/events");
  });

  test("reports errors to Sentry only when SENTRY_DSN is set (TS-115)", () => {
    expect(apiConfig({})).toMatchObject({ sentryDsn: undefined, environment: "development" });
    const dsn = "https://key@o1.ingest.de.sentry.io/2";
    expect(apiConfig({ ...production, SENTRY_DSN: dsn })).toMatchObject({
      sentryDsn: dsn,
      environment: "production",
    });
  });

  test("sends email through Resend when its key is set, and through SMTP otherwise (TS-72)", () => {
    const { SMTP_URL: _, ...withoutSmtp } = production;
    expect(() => apiConfig(withoutSmtp)).toThrow("Set RESEND_API_KEY (or SMTP_URL) in production");
    expect(apiConfig({ ...withoutSmtp, RESEND_API_KEY: "re_test" }).resendApiKey).toBe("re_test");
    expect(apiConfig(production).resendApiKey).toBeUndefined();
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

  test("a host-only cookie when the API and the web app share one origin, as behind the TON-22 tunnel", () => {
    const shared = "https://tonaris-test.trycloudflare.com";
    expect(apiConfig({ WEB_ORIGIN: shared, API_ORIGIN: shared }).cookieDomain).toBeUndefined();
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

  test("turns the Spotify bridge on only with both credentials, and off with SPOTIFY_BRIDGE=off (TS-41)", () => {
    expect(apiConfig({}).spotify).toBeUndefined();
    expect(apiConfig({ SPOTIFY_CLIENT_ID: "id" }).spotify).toBeUndefined();
    const credentials = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" };
    expect(apiConfig(credentials).spotify).toEqual({ clientId: "id", clientSecret: "secret" });
    expect(apiConfig({ ...credentials, SPOTIFY_BRIDGE: "off" }).spotify).toBeUndefined();
  });
});
