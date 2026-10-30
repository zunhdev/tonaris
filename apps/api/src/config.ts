// What tonaris-api listens on and whom it trusts (TS-08, TS-105). Local development runs on defaults (TS-06);
// production must set every origin and secret, and start-up fails without them. `.env.example` lists them.

import path from "node:path";
import { pathToFileURL } from "node:url";

export type ApiConfig = {
  port: number;
  /** The API's own origin, `https://api.tonaris.<tld>` (TS-08): Better Auth's base URL. */
  apiOrigin: string;
  /**
   * The web app's origin: the only credentialed CORS origin (TS-102), Better Auth's trusted origin, and where
   * the links in emails point.
   */
  webOrigin: string;
  /**
   * The parent domain the session cookie is scoped to (TS-08): the web app's host, since it is the apex. None
   * for `localhost` or an IP address, where a host-only cookie already reaches every port, or when both share
   * one origin.
   */
  cookieDomain: string | undefined;
  authSecret: string;
  /** Resend's API key (TS-72): email goes through Resend when it is set, and through `smtpUrl` otherwise. */
  resendApiKey: string | undefined;
  smtpUrl: string;
  /** The sender, such as `Tonaris <no-reply@mail.tonaris.app>`: an address on a domain the provider verified. */
  emailFrom: string;
  /** Where people write for help, shown on `/help/recovery` (TS-73): a mailbox the creator reads. */
  supportEmail: string;
  /**
   * Where the revocation ledger is written (TS-113): `s3://bucket/prefix` off-site in production, or a `file:` URL.
   * Locally it defaults to `.ledger/` beside the API.
   */
  ledgerUrl: string;
  /** Sentry's project key for the API (TS-115); unset, no error leaves the process but in its logs. */
  sentryDsn: string | undefined;
  /** Sentry's name for where it runs: `production`, or `development` locally. */
  environment: "production" | "development";
  /** The header the host's proxy puts the client address in; unset means the socket address (TS-104). */
  clientIpHeader: string | undefined;
  /**
   * The Spotify bridge's app credentials (TS-41 step 3), or undefined when the bridge is off: `SPOTIFY_BRIDGE=off`,
   * or either credential missing. Spotify links are then identified by MusicBrainz's URL lookup alone.
   */
  spotify: { clientId: string; clientSecret: string } | undefined;
  /**
   * The commit this build is, when the host says (`GIT_COMMIT`, or Render's `RENDER_GIT_COMMIT`): `/v1/health`
   * names it, and the web app's deploy waits until the API runs its own commit (TS-01).
   */
  commit: string | undefined;
};

type Env = Record<string, string | undefined>;

// Development only: production refuses to start without its own BETTER_AUTH_SECRET.
const localAuthSecret = "3f9c1e7a5b2d48c6a0e4f7b9d1c3a5e7f2b4d6c8a0e1f3b5d7c9a2e4f6b8d0c1";

const localDefaults = {
  API_ORIGIN: "http://localhost:3001",
  WEB_ORIGIN: "http://localhost:3000",
  BETTER_AUTH_SECRET: localAuthSecret,
  SMTP_URL: "smtp://localhost:1025",
  EMAIL_FROM: "Tonaris <no-reply@tonaris.test>",
  SUPPORT_EMAIL: "support@tonaris.test",
} as const;

const requiredInProduction = [
  "API_ORIGIN",
  "WEB_ORIGIN",
  "BETTER_AUTH_SECRET",
  "EMAIL_FROM",
  "SUPPORT_EMAIL",
] as const satisfies (keyof typeof localDefaults)[];
/** Required in production with no local default: the ledger must be off-site (TS-113). */
const requiredOffSite = ["LEDGER_URL"] as const;
type Required = (typeof requiredInProduction)[number] | "SMTP_URL";

export function apiConfig(env: Env = process.env): ApiConfig {
  const production = env.NODE_ENV === "production";
  const missing: string[] = [...requiredInProduction, ...requiredOffSite].filter(
    (name) => !env[name],
  );
  if (!env.RESEND_API_KEY && !env.SMTP_URL) missing.push("RESEND_API_KEY (or SMTP_URL)");
  if (production && missing.length > 0) {
    throw new Error(`Set ${missing.join(", ")} in production (see .env.example).`);
  }
  const value = (name: Required) => env[name] || localDefaults[name];

  const apiOrigin = origin("API_ORIGIN", value("API_ORIGIN"), production);
  const webOrigin = origin("WEB_ORIGIN", value("WEB_ORIGIN"), production);
  // One origin for both, behind a proxy that routes by path (the TON-22 tunnel): a host-only cookie reaches both.
  const cookieDomain = apiOrigin === webOrigin ? undefined : parentDomain(webOrigin);
  if (cookieDomain && !new URL(apiOrigin).hostname.endsWith(`.${cookieDomain}`)) {
    throw new Error(
      `API_ORIGIN (${apiOrigin}) must be a subdomain of WEB_ORIGIN's host ${cookieDomain} so the session cookie reaches both (TS-08).`,
    );
  }

  return {
    port: Number(env.PORT ?? 3001),
    apiOrigin,
    webOrigin,
    cookieDomain,
    authSecret: value("BETTER_AUTH_SECRET"),
    resendApiKey: env.RESEND_API_KEY || undefined,
    smtpUrl: value("SMTP_URL"),
    emailFrom: value("EMAIL_FROM"),
    supportEmail: value("SUPPORT_EMAIL"),
    ledgerUrl: env.LEDGER_URL || pathToFileURL(path.resolve(".ledger")).href,
    sentryDsn: env.SENTRY_DSN || undefined,
    environment: production ? "production" : "development",
    clientIpHeader: env.CLIENT_IP_HEADER?.toLowerCase() || undefined,
    spotify:
      env.SPOTIFY_BRIDGE?.toLowerCase() !== "off" &&
      env.SPOTIFY_CLIENT_ID &&
      env.SPOTIFY_CLIENT_SECRET
        ? { clientId: env.SPOTIFY_CLIENT_ID, clientSecret: env.SPOTIFY_CLIENT_SECRET }
        : undefined,
    commit: env.GIT_COMMIT || env.RENDER_GIT_COMMIT || undefined,
  };
}

/** The origin of `url`, which must be nothing more than an origin, and HTTPS in production. */
function origin(name: string, url: string, production: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${name} must be an origin such as https://tonaris.example, not "${url}".`);
  }
  if (parsed.origin !== url.replace(/\/$/, "")) {
    throw new Error(`${name} must be an origin only, without a path: "${url}".`);
  }
  if (production && parsed.protocol !== "https:") {
    throw new Error(`${name} must use https in production: "${url}".`);
  }
  return parsed.origin;
}

function parentDomain(webOrigin: string): string | undefined {
  const { hostname } = new URL(webOrigin);
  const isIp = /^[\d.]+$/.test(hostname) || hostname.startsWith("[");
  return hostname === "localhost" || isIp ? undefined : hostname;
}
