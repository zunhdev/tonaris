// The document every route renders into. Workspace routes are client-only, but the server still sends this
// shell, so even their first paint is dark (DS-11) and styled.

import { apiUrl, apiUrlMeta, sentryDsn, sentryDsnMeta, testHooks, testHooksMeta } from "@/config";
import { createRootRoute, HeadContent, Link, Scripts, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { CSPProvider } from "@tonaris/ui/components/csp-provider";

import stylesheet from "@tonaris/ui/globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Tonaris" },
      // The API origin the server was configured with, for the browser (src/config.ts).
      { name: apiUrlMeta, content: apiUrl },
      // Sentry's key, when errors are reported (src/observability.ts, TS-115).
      ...(sentryDsn ? [{ name: sentryDsnMeta, content: sentryDsn }] : []),
      ...(testHooks ? [{ name: testHooksMeta, content: "on" }] : []),
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      // The temporary mark (TON-114): SVG where browsers take it, a PNG where they don't, and iOS's own.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main
      aria-labelledby="not-found-title"
      className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <h1 id="not-found-title" className="text-page text-fg-primary">
        Page not found
      </h1>
      <Link to="/c" className="text-accent-solid underline-offset-4 hover:underline">
        Go to your collection
      </Link>
    </main>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  // The request's CSP nonce (TS-101), also for the inline elements Base UI renders.
  const nonce = useRouter().options.ssr?.nonce;
  return (
    <html lang="en" data-theme="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <CSPProvider nonce={nonce}>{children}</CSPProvider>
        <Scripts />
      </body>
    </html>
  );
}
