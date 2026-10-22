// Trash (DS-32, desktop only): a placeholder until deleting (M5).

import { TrashView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/trash")({
  head: () => ({ meta: [{ title: "Trash · Tonaris" }] }),
  component: TrashView,
});
