// `/` opens the collection view last visited on this device, or the root, `/c` (DS-32). It reads the device's
// memory, so it runs in the browser, under the workspace like every signed-in route (TS-03).

import { lastView } from "@/features/shell/device";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/")({
  beforeLoad: ({ context }) => {
    throw redirect({ href: lastView.read(context.account.id) ?? "/c", replace: true });
  },
});
