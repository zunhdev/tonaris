// `/` opens a collection view (DS-32). Until the last visited view is remembered, that is the root, `/c`.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/c" });
  },
});
