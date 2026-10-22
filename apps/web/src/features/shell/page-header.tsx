// The main view's header (DS-30): the path to the view as breadcrumbs, then its name, which also names the main
// landmark (FR-01.3, DS-29). With the sidebar hidden, a button brings it back (DS-30).

import { PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@tonaris/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";

import { useShell } from "./shell-context";

export const pageTitleId = "page-title";

export function PageHeader({
  title,
  icon,
  breadcrumbs,
  actions,
}: {
  title: string;
  icon?: ReactNode;
  /** The links to the view's ancestors, from Collection down; none for a top-level view. */
  breadcrumbs?: ReactNode[];
  /** Controls at the header's end, such as the layout switch. */
  actions?: ReactNode;
}) {
  const { sidebarHidden, toggleSidebar } = useShell();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-6">
      {sidebarHidden && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Show sidebar" className="-ml-3" />
            }
            onClick={toggleSidebar}
          >
            <PanelLeftOpen strokeWidth={1.5} aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">Show sidebar [</TooltipContent>
        </Tooltip>
      )}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumbs" className="min-w-0 shrink">
          <ol className="flex min-w-0 items-center gap-1.5 text-fg-secondary">
            {breadcrumbs.map((crumb, index) => (
              // The crumbs are the path, so their positions are their identity.
              // oxlint-disable-next-line react/no-array-index-key
              <li key={index} className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate">{crumb}</span>
                <span aria-hidden className="text-fg-tertiary">
                  ›
                </span>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {icon}
      <h1 id={pageTitleId} className="min-w-0 truncate text-page text-fg-primary">
        {title}
      </h1>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
