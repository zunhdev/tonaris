// Trash (DS-32, DS-55, desktop only): the units in Trash, to restore or delete for good.

import { TrashView } from "@/features/trash/trash-view";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/trash")({
  head: () => ({ meta: [{ title: "Trash · Tonaris" }] }),
  component: TrashView,
});
