// The desktop shell (DS-30): sidebar, main view and, once an item is opened, the inspector. Until then the
// inspector takes no space. Each pane is a named landmark (Q-02).

import type { ReactNode } from "react";

import { pageTitleId } from "./page-header";
import { Sidebar } from "./sidebar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-dvh grid-cols-[240px_minmax(0,1fr)] bg-app">
      <Sidebar />
      <main aria-labelledby={pageTitleId} className="flex min-w-0 flex-col bg-panel">
        {children}
      </main>
    </div>
  );
}
