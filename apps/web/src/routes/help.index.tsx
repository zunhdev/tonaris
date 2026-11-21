// `/help` (FR-16.1, DS-122): Help's home, public and rendered on the server (features/help).

import { HelpHome } from "@/features/help/help-home";
import { createFileRoute } from "@tanstack/react-router";

const description =
  "Short answers to how Tonaris works: adding albums, organizing them, sharing, AI agents, and every key.";

export const Route = createFileRoute("/help/")({
  head: () => ({
    meta: [
      { title: "Help · Tonaris" },
      { name: "description", content: description },
      { property: "og:title", content: "Tonaris Help" },
      { property: "og:description", content: description },
    ],
  }),
  component: HelpHome,
});
