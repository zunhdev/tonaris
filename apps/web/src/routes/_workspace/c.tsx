// The collection root (DS-32): its header, and until the rows (TON-34) a summary or its empty state.

import { RootView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/c")({
  head: () => ({ meta: [{ title: "Collection · Tonaris" }] }),
  component: RootView,
});
