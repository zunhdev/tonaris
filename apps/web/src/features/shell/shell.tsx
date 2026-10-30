// The desktop shell (DS-30): sidebar, main view and, once an album is opened, the inspector, 380 px wide beside the
// view, or over it below 1100 px. Until then the inspector takes no space. Each pane is a named landmark (Q-02). The
// sidebar is 240 px wide by default, resizable from 200 to 360 px and hideable with `[`, both kept on this device.
// Offline, a banner tops the main view (DS-81). The workspace's shortcuts and their reference live here (DS-78), as
// does the search palette (DS-75), and so do dragging, which spans the sidebar and the view, "Move to…" (DS-49), "Add to list…" (DS-46) and the manual
// entry form (DS-47). On a phone the shell is a drill-down (DS-110): no sidebar, each view's header is its top bar,
// and an album opens as a sheet over the view.

import { CaptureDialog } from "@/features/capture/capture-dialog";
import { CapturePanel } from "@/features/capture/capture-panel";
import { AddToListDialog } from "@/features/collection/add-to-list";
import { useCollectionUi, useNarrowScreen } from "@/features/collection/collection-ui";
import { DeleteAlbumDialog, DeleteFolderDialog } from "@/features/collection/delete-containers";
import { DragProvider } from "@/features/collection/drag";
import { AlbumInspector } from "@/features/collection/inspector";
import { useInspector } from "@/features/collection/inspector-state";
import { MoveDialog } from "@/features/collection/move";
import { NewAlbumDialog } from "@/features/collection/new-album";
import { SearchPalette } from "@/features/search/search-palette";
import { ShareDialog } from "@/features/sharing/share-dialog";
import { OfflineBanner } from "@/features/sync/offline-banner";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { Account } from "@tonaris/domain";

import { sidebarLayout } from "./device";
import { pageTitleId } from "./page-header";
import { inspectorWidth, ShellContext, type ShellControl } from "./shell-context";
import { ShortcutReference } from "./shortcut-reference";
import { Sidebar } from "./sidebar";
import { useCommandRunner, useShortcuts, type CommandTarget } from "./use-shortcuts";

const wideQuery = "(min-width: 1100px)";

const subscribeWide = (listener: () => void) => {
  const query = globalThis.matchMedia?.(wideQuery);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
};

/** Whether the window is wide enough for the inspector beside the view (DS-30). */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => globalThis.matchMedia?.(wideQuery).matches ?? true,
    () => true,
  );
}

export function Shell({ account, children }: { account: Account; children: ReactNode }) {
  const [layout, setLayout] = useState(() => sidebarLayout.read());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The palette, and what had the focus when it opened, for its commands (DS-75).
  const [search, setSearch] = useState<{ open: boolean; target: CommandTarget }>({
    open: false,
    target: {},
  });
  const { editing } = useCollectionUi();
  const { albumId } = useInspector();
  const wide = useWideScreen();
  const narrow = useNarrowScreen();
  const beside = albumId !== undefined && wide;
  const sidebar = !layout.hidden && !narrow;

  useEffect(() => sidebarLayout.write(layout), [layout]);

  const toggleSidebar = useCallback(
    () => setLayout((current) => ({ ...current, hidden: !current.hidden })),
    [],
  );
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  // An editor started while the sidebar is hidden shows it, since the editor is in it.
  useEffect(
    () =>
      editing.subscribe(() => {
        if (!editing.current) return;
        setLayout((current) => (current.hidden ? { ...current, hidden: false } : current));
      }),
    [editing],
  );
  const runner = useCommandRunner({ toggleSidebar, openShortcuts });
  const captureTarget = runner.target;
  // Before the palette takes the focus.
  const openSearch = useCallback(
    () => setSearch({ open: true, target: captureTarget() }),
    [captureTarget],
  );
  const setSearchOpen = useCallback(
    (open: boolean) => setSearch((current) => ({ ...current, open })),
    [],
  );
  useShortcuts({ runner, openSearch });

  const control = useMemo<ShellControl>(
    () => ({
      account,
      sidebarHidden: layout.hidden,
      inspectorBeside: beside,
      toggleSidebar,
      openShortcuts,
      openSearch,
      runCommand: runner.run,
      commandBlocked: runner.blocked,
    }),
    [
      account,
      layout.hidden,
      beside,
      toggleSidebar,
      openShortcuts,
      openSearch,
      runner.run,
      runner.blocked,
    ],
  );

  return (
    <ShellContext value={control}>
      <DragProvider>
        <div
          className="grid h-dvh bg-app"
          style={{
            gridTemplateColumns: [
              sidebar ? `${layout.width}px` : undefined,
              "minmax(0,1fr)",
              beside ? `${inspectorWidth}px` : undefined,
            ]
              .filter(Boolean)
              .join(" "),
          }}
        >
          {sidebar && (
            <Sidebar
              account={account}
              width={layout.width}
              onResize={(width) => setLayout((current) => ({ ...current, width }))}
            />
          )}
          <main aria-labelledby={pageTitleId} className="flex min-h-0 min-w-0 flex-col bg-panel">
            <OfflineBanner />
            {children}
          </main>
          {albumId !== undefined && (
            <AlbumInspector placement={narrow ? "sheet" : wide ? "beside" : "overlay"} />
          )}
        </div>
      </DragProvider>
      <ShortcutReference open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <SearchPalette
        open={search.open}
        onOpenChange={setSearchOpen}
        target={search.target}
        runner={runner}
      />
      <MoveDialog />
      <ShareDialog />
      <DeleteFolderDialog />
      <DeleteAlbumDialog />
      <AddToListDialog />
      <NewAlbumDialog />
      <CaptureDialog />
      <CapturePanel />
    </ShellContext>
  );
}
