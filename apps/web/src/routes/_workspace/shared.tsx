// Shared with me (DS-32): a placeholder until sharing (M7).

import { SharedView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/shared")({
  head: () => ({ meta: [{ title: "Shared with me · Tonaris" }] }),
  component: SharedView,
});
