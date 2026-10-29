// Shared with me (DS-32, DS-67): the shared folders and lists the person keeps.

import { SharedWithMeView } from "@/features/sharing/shared-with-me";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/shared")({
  head: () => ({ meta: [{ title: "Shared with me · Tonaris" }] }),
  component: SharedWithMeView,
});
