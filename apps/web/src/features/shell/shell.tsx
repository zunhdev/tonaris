// The desktop shell (DS-30): sidebar, main view and, once an item is opened, the inspector. Until then the
// inspector takes no space. Each pane is a named landmark (Q-02). The sidebar is 240 px wide by default, resizable
// from 200 to 360 px and hideable with `[`, both kept on this device. Offline, a banner tops the main view (DS-81).
// The workspace's shortcuts and their reference live here (DS-78).

import { useCollectionUi } from "@/features/collection/collection-ui";
import { OfflineBanner } from "@/features/sync/offline-banner";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { Account } from "@tonaris/domain";

import { sidebarLayout } from "./device";
import { pageTitleId } from "./page-header";
import { ShellContext, type ShellControl } from "./shell-context";
import { ShortcutReference } from "./shortcut-reference";
import { Sidebar } from "./sidebar";
import { useShortcuts } from "./use-shortcuts";

export function Shell({ account, children }: { account: Account; children: ReactNode }) {
  const [layout, setLayout] = useState(() => sidebarLayout.read());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { editing } = useCollectionUi();

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
  useShortcuts({ toggleSidebar, openShortcuts });

  const control = useMemo<ShellControl>(
    () => ({ sidebarHidden: layout.hidden, toggleSidebar, openShortcuts }),
    [layout.hidden, toggleSidebar, openShortcuts],
  );

  return (
    <ShellContext value={control}>
      <div
        className="grid h-dvh bg-app"
        style={{
          gridTemplateColumns: layout.hidden ? "minmax(0,1fr)" : `${layout.width}px minmax(0,1fr)`,
        }}
      >
        {!layout.hidden && (
          <Sidebar
            account={account}
            width={layout.width}
            onResize={(width) => setLayout((current) => ({ ...current, width }))}
          />
        )}
        <main aria-labelledby={pageTitleId} className="flex min-w-0 flex-col bg-panel">
          <OfflineBanner />
          {children}
        </main>
      </div>
      <ShortcutReference open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </ShellContext>
  );
}
