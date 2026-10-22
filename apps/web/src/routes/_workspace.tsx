// The signed-in workspace (TS-03): client-only. Every route below this pathless layout inherits `ssr: false`,
// so the server sends just the document and the browser renders the shell and loads the collection once, through
// the sync client (src/features/sync), with what it says about saving around it.
// It needs a session (FR-11.1): a signed-out visit goes to sign-in and comes back here afterwards.

import { currentAccount } from "@/features/account/session";
import { Shell } from "@/features/shell/shell";
import { SaveStateLayer } from "@/features/sync/save-state-layer";
import { SyncProvider } from "@/features/sync/sync-provider";
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";

import { Button } from "@tonaris/ui/components/button";

export const Route = createFileRoute("/_workspace")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const account = await currentAccount();
    if (!account) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    return { account };
  },
  component: WorkspaceLayout,
  errorComponent: Unreachable,
});

function WorkspaceLayout() {
  const { account } = Route.useRouteContext();
  return (
    <SyncProvider account={account}>
      <SaveStateLayer>
        <Shell account={account}>
          <Outlet />
        </Shell>
      </SaveStateLayer>
    </SyncProvider>
  );
}

function Unreachable() {
  const router = useRouter();
  return (
    <main
      aria-labelledby="unreachable-title"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 id="unreachable-title" className="text-page text-fg-primary">
        Couldn't reach Tonaris
      </h1>
      <p className="text-fg-secondary">Check your connection and try again.</p>
      <Button onClick={() => void router.invalidate()}>Try again</Button>
    </main>
  );
}
