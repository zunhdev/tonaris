// The collection root (DS-32): its header, and until the rows (TON-34) a summary or its empty state. On a phone,
// `?show=shared` shows what's shared instead of the person's own (TON-134).

import { RootView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/c")({
  validateSearch: (search: Record<string, unknown>): { show?: "shared" } =>
    search.show === "shared" ? { show: "shared" } : {},
  head: () => ({ meta: [{ title: "Collection · Tonaris" }] }),
  component: RootView,
});
