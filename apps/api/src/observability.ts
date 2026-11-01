// The API's logs and error reports (TS-115): JSON lines on stdout and stderr, which the host collects, and Sentry
// when SENTRY_DSN is set. Both pass through the domain's `redact` (TS-115, Q-06): no token, secret, cookie, code or
// email leaves. Sentry gets no request bodies, cookies, headers, query strings or user, so titles and descriptions
// don't either.

import * as Sentry from "@sentry/bun";

import { redact, redactRecord, redactText } from "@tonaris/domain";

type Level = "info" | "error";

/** Gets a failure that no request answers, with where it happened: `reportError`, or a stand-in in tests. */
export type LogError = (error: unknown, context: string) => void;

/** One JSON log line, redacted. */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify(
    redact({ time: new Date().toISOString(), level, message, ...fields }),
  );
  if (level === "error") console.error(line);
  else console.log(line);
}

function described(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { error: { name: error.name, message: error.message, stack: error.stack } }
    : { error: String(error) };
}

/** Logs `error` as having happened in `context`, and sends it to Sentry when it is on. */
export const reportError: LogError = (error, context) => {
  log("error", context, described(error));
  Sentry.captureException(error, { tags: { context: redactText(context) } });
};

/** Switches Sentry on for `dsn`, if there is one; reports are scrubbed as above. */
export function startErrorReports(dsn: string | undefined, environment: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    // Nothing about the person or the request: Sentry 11 collects all of it unless told not to.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Some traces for performance (TS-115), few enough to stay within a free plan.
    tracesSampleRate: 0.05,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

/** An error report without what might identify someone or let them in (TS-115). */
export function scrubEvent<Event extends Sentry.ErrorEvent>(event: Event): Event {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = redactText(event.request.url);
  }
  delete event.user;
  if (event.message) event.message = redactText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
  }
  if (event.extra) event.extra = redactRecord(event.extra);
  return event;
}

/** A breadcrumb, redacted the same way. */
export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = redactText(breadcrumb.message);
  if (breadcrumb.data) breadcrumb.data = redactRecord(breadcrumb.data);
  return breadcrumb;
}
