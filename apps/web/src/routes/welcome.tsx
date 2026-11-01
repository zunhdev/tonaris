// `/welcome` (TON-155, DS-120): the landing page, public and rendered on the server, where a signed-out visit to `/`
// arrives (src/start.ts, routes/_workspace.tsx).

import { LandingPage } from "@/features/landing/landing-page";
import { createFileRoute } from "@tanstack/react-router";

const description =
  "Paste a link from Spotify, Apple Music, Qobuz, Tidal or YouTube Music and Tonaris fills in the album. Folders within folders, AI agents through MCP, sharing and an export that is always yours.";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Your albums, organized your way · Tonaris" },
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Tonaris: your albums, organized your way" },
      { property: "og:description", content: description },
    ],
  }),
  component: LandingPage,
});
