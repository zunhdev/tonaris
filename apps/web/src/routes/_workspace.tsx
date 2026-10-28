// The signed-in workspace (TS-03): client-only. Every route below this pathless layout inherits `ssr: false`,
// so the server sends just the document and the browser renders the shell and loads the collection once, through
// the sync client (src/features/sync), with what it says about saving around it.
// It needs a session (FR-11.1): a signed-out visit goes to sign-in and comes back here afterwards. Each collection
// view visited is remembered on the device, for `/` (DS-32).

import { currentAccount } from "@/features/account/session";
import { CaptureProvider } from "@/features/capture/capture-context";
import { CollectionUiProvider } from "@/features/collection/collection-ui";
import { CollectionDataProvider } from "@/features/collection/data";
import { OpenInProvider } from "@/features/open/open-in";
import { lastView } from "@/features/shell/device";
import { Shell } from "@/features/shell/shell";
import { SaveStateLayer } from "@/features/sync/save-state-layer";
import { SyncProvider } from "@/features/sync/sync-provider";
import { createFileRoute, Outlet, redirect, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@tonaris/ui/components/button";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_workspace")({
  ssr: false,
  // The open album inspector, on any view (DS-32, DS-46); anything but an ID is dropped.
  validateSearch: (search: Record<string, unknown>): { album?: string } =>
    typeof search.album === "string" && uuid.test(search.album) ? { album: search.album } : {},
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
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => lastView.write(account.id, pathname), [account.id, pathname]);
  return (
    <SyncProvider account={account}>
      <CollectionUiProvider accountId={account.id}>
        <CollectionDataProvider>
          <SaveStateLayer>
            <CaptureProvider>
              <OpenInProvider>
                <Shell account={account}>
                  <Outlet />
                </Shell>
              </OpenInProvider>
            </CaptureProvider>
          </SaveStateLayer>
        </CollectionDataProvider>
      </CollectionUiProvider>
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
