// The TanStack Router instance that Start renders on the server and hydrates in the browser (TS-03).

import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // On the server, the request's CSP nonce (src/start.ts) goes on every script and style the router renders.
    // The browser reads it back from the page when it hydrates.
    ssr: { nonce: getGlobalStartContext()?.nonce },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
