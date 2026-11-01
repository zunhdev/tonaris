// The signed-in workspace (TS-03): client-only. Every route below this pathless layout inherits `ssr: false`,
// so the server sends just the document and the browser renders the shell and loads the collection once, through
// the sync client (src/features/sync), with what it says about saving around it.
// It needs a session (FR-11.1): a signed-out visit goes to sign-in and comes back here afterwards. A member who hasn't
// agreed to the current terms sees the agreement screen instead, and nothing of the collection loads until they do
// (TON-131). Each collection view visited is remembered on the device, for `/` (DS-32), and each folder, list and
// album opened, for the palette's Recent (DS-75).

import { currentAccount } from "@/features/account/session";
import { CaptureProvider } from "@/features/capture/capture-context";
import { CollectionUiProvider } from "@/features/collection/collection-ui";
import { CollectionDataProvider } from "@/features/collection/data";
import { TermsScreen } from "@/features/legal/terms-screen";
import { OpenInProvider } from "@/features/open/open-in";
import { SharedEntriesProvider } from "@/features/sharing/shared-entries";
import { lastView, openedItems, recentItems } from "@/features/shell/device";
import { Shell } from "@/features/shell/shell";
import { SaveStateLayer } from "@/features/sync/save-state-layer";
import { SyncProvider } from "@/features/sync/sync-provider";
import { RecoveryProvider } from "@/features/trash/recovery";
import { uuidSearch } from "@/search";
import { createFileRoute, Outlet, redirect, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@tonaris/ui/components/button";

// The open album inspector, on any view (DS-32, DS-46); anything but an ID is dropped.
// Made outside the route's options: inferred inside them, beside the functions there, its key's type is lost.
const albumSearch = uuidSearch("album");

export const Route = createFileRoute("/_workspace")({
  ssr: false,
  validateSearch: albumSearch,
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
  const album = Route.useSearch({ select: (search) => search.album });
  useEffect(() => lastView.write(account.id, pathname), [account.id, pathname]);
  // What was opened, for the palette's Recent (DS-75).
  useEffect(
    () => recentItems.record(account.id, openedItems(pathname, album)),
    [account.id, pathname, album],
  );
  if (!account.termsAgreed) return <TermsScreen account={account} />;
  return (
    <SyncProvider account={account}>
      <CollectionUiProvider accountId={account.id}>
        <CollectionDataProvider>
          <SaveStateLayer>
            <CaptureProvider>
              <OpenInProvider>
                <RecoveryProvider>
                  <SharedEntriesProvider>
                    <Shell account={account}>
                      <Outlet />
                    </Shell>
                  </SharedEntriesProvider>
                </RecoveryProvider>
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
