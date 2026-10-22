// Unsorted (DS-32): the albums in no list (FR-01.9).

import { UnsortedView } from "@/features/collection/views";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/unsorted")({
  head: () => ({ meta: [{ title: "Unsorted · Tonaris" }] }),
  component: UnsortedView,
});
