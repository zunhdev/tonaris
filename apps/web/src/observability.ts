// The web app's error reports (TS-115): Sentry in the browser, when the server was given SENTRY_DSN, loaded only then
// so it stays out of the main bundle. Nothing about the person or their requests is collected, console messages
// aren't kept as breadcrumbs (they may hold titles), and what is sent passes through the domain's redaction: no
// token, code, cookie or email leaves. Errors before it has loaded are only in the browser's console.

import { redactRecord, redactText } from "@tonaris/domain";

import { sentryDsn } from "./config";
import type * as SentryClient from "./sentry-client";

let sentry: Promise<typeof SentryClient | undefined> | undefined;

function started(Sentry: typeof SentryClient, dsn: string): typeof SentryClient {
  Sentry.init({
    dsn,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // No console breadcrumbs, which may hold titles, and no DOM ones.
    integrations: (defaults) => [
      ...defaults.filter(({ name }) => name !== "Breadcrumbs" && name !== "Console"),
      Sentry.breadcrumbsIntegration({ dom: false }),
    ],
    beforeSend(event) {
      if (event.request?.url) event.request.url = redactText(event.request.url);
      delete event.user;
      if (event.message) event.message = redactText(event.message);
      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = redactText(exception.value);
      }
      if (event.extra) event.extra = redactRecord(event.extra);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.message) breadcrumb.message = redactText(breadcrumb.message);
      if (breadcrumb.data) breadcrumb.data = redactRecord(breadcrumb.data);
      return breadcrumb;
    },
  });
  return Sentry;
}

/** Switches error reports on, once, in the browser. */
export function startErrorReports(): void {
  if (sentry || typeof document === "undefined" || !sentryDsn) return;
  const dsn = sentryDsn;
  sentry = import("./sentry-client").then(
    (Sentry) => started(Sentry, dsn),
    () => undefined,
  );
}

/** Reports an error a route's boundary caught, which the browser's global handlers don't see. */
export async function reportError(error: unknown): Promise<void> {
  (await sentry)?.captureException(error);
}

/** Reports a test error from the browser, with a fake address in it, to check the reports with (TS-115). */
export async function reportTestError(): Promise<boolean> {
  const Sentry = await sentry;
  if (!Sentry) return false;
  Sentry.captureException(new Error("Tonaris web test error for anna@example.com (TS-115)"));
  return true;
}
