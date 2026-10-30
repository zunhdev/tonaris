// Where the browser reaches the API (TS-08), read when the server starts, so one build serves any host (TS-110).
// The server takes `API_URL` (default: the local API that `bun dev` starts, TS-06) and renders it into every page
// (`apiUrlMeta`, in the root route's head); the browser reads it back from there.

const localApiUrl = "http://localhost:3001";

/** The `<meta>` the root route renders, so the browser learns the API origin the server was given. */
export const apiUrlMeta = "tonaris:api-url";

function readApiUrl(): string {
  if (typeof document === "undefined") {
    if (process.env.API_URL) return process.env.API_URL;
    if (process.env.NODE_ENV === "production")
      throw new Error("Set API_URL in production (see .env.example).");
    return localApiUrl;
  }
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${apiUrlMeta}"]`);
  return meta?.content || localApiUrl;
}

export const apiUrl: string = readApiUrl();

/**
 * Where the server's loaders reach the API (TS-03): `API_INTERNAL_URL`, over the host's private network, when set;
 * otherwise `API_URL`. In the browser, `apiUrl`. A bare `host:port`, as Render's Blueprint gives it, is plain HTTP.
 */
export const serverApiUrl: string =
  typeof document === "undefined" ? internalUrl(process.env.API_INTERNAL_URL) || apiUrl : apiUrl;

function internalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

/** The `<meta>` carrying the web app's Sentry key (TS-115), when the server has `SENTRY_DSN`. */
export const sentryDsnMeta = "tonaris:sentry-dsn";

function readSentryDsn(): string | undefined {
  if (typeof document === "undefined") return process.env.SENTRY_DSN || undefined;
  return (
    document.querySelector<HTMLMetaElement>(`meta[name="${sentryDsnMeta}"]`)?.content || undefined
  );
}

/** Where the browser reports errors (TS-115); undefined keeps them in the browser's console. */
export const sentryDsn: string | undefined = readSentryDsn();

/**
 * The `<meta>` that switches on hooks for the browser tests (TS-121): the root route renders it only when the
 * server runs with `TEST_HOOKS=1`, as the e2e setup does, so the production build is the one under test.
 */
export const testHooksMeta = "tonaris:test-hooks";

function readTestHooks(): boolean {
  if (typeof document === "undefined") return process.env.TEST_HOOKS === "1";
  return document.querySelector(`meta[name="${testHooksMeta}"]`) !== null;
}

/** Whether this page may expose internals to the browser tests. */
export const testHooks: boolean = readTestHooks();
