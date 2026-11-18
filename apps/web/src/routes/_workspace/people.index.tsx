// People (DS-121, FR-07.24): everyone the person shares with, either way.

import { PeopleView } from "@/features/sharing/people";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/people/")({
  head: () => ({ meta: [{ title: "People · Tonaris" }] }),
  component: PeopleView,
});
