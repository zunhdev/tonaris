// The TanStack Router instance that Start renders on the server and hydrates in the browser (TS-03).

import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";

import { PageError } from "./common/page-error";
import { pageScrollSelectors } from "./common/page-scroll";
import { reportError, startErrorReports } from "./observability";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // In the browser, once: reports go to Sentry when the server was given a key (TS-115).
  startErrorReports();
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // A page's own scroll containers start at the top on a new page, not where the last page's were (TON-157).
    scrollToTopSelectors: pageScrollSelectors,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // On the server, the request's CSP nonce (src/start.ts) goes on every script and style the router renders.
    // The browser reads it back from the page when it hydrates.
    ssr: { nonce: getGlobalStartContext()?.nonce },
    // Errors a route's boundary catches never reach the browser's global handlers.
    defaultOnCatch: (error) => void reportError(error),
    // A page that can't be shown says why in its own place; the shell around it stays (DRIFT-081).
    defaultErrorComponent: PageError,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
