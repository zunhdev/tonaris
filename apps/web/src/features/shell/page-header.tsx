// The main view's header (DS-30): the path to the view as breadcrumbs, then its name, which also names the main
// landmark (FR-01.3, DS-29). The name is the breadcrumbs' size, set apart by weight and colour (TON-107). With the
// sidebar hidden, a button brings it back (DS-30). On a phone it is the top bar of a drill-down (DS-110): Back to the
// view above, the name, the view's own controls, Search and Account.

import { AccountMenu } from "@/features/account/account-menu";
import { useNarrowScreen } from "@/features/collection/collection-ui";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft, PanelLeftOpen, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@tonaris/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@tonaris/ui/components/tooltip";
import { cn } from "@tonaris/ui/lib/utils";

import { useShell } from "./shell-context";

export const pageTitleId = "page-title";

export function PageHeader({
  title,
  icon,
  breadcrumbs,
  actions,
  editing = false,
  back,
}: {
  title: string;
  icon?: ReactNode;
  /** The links to the view's ancestors, from Collection down; none for a top-level view. */
  breadcrumbs?: ReactNode[];
  /** Controls at the header's end, such as the mode toggle and View options. */
  actions?: ReactNode;
  /** Editing mode tints the bottom border, so the mode is visible at a glance (DS-45). */
  editing?: boolean;
  /** On a phone, where Back goes: the view above this one (DS-110). None at the top. */
  back?: { to: string; label: string };
}) {
  const { sidebarHidden, toggleSidebar, account, openSearch } = useShell();
  const narrow = useNarrowScreen();
  const router = useRouter();
  if (narrow) {
    return (
      // Sticky and opaque at the top edge: an iOS 26 Home Screen app blurs its top edge unless a sticky or fixed bar
      // of one solid colour covers it, and then takes that colour for the status bar (TON-135).
      <header
        className="sticky top-0 z-10 flex min-h-12 shrink-0 items-center gap-1 border-b border-subtle bg-app px-1"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {back ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Back to ${back.label}`}
            className="size-11"
            onClick={() => router.history.push(back.to)}
          >
            <ChevronLeft strokeWidth={1.5} aria-hidden />
          </Button>
        ) : (
          <span className="w-2 shrink-0" />
        )}
        {icon}
        <h1 id={pageTitleId} className="min-w-0 flex-1 truncate text-title text-fg-primary">
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center">{actions}</div>}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          className="size-11"
          onClick={openSearch}
        >
          <Search strokeWidth={1.5} aria-hidden />
        </Button>
        {account && <AccountMenu account={account} compact />}
      </header>
    );
  }
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 border-b px-6",
        editing ? "border-accent-solid" : "border-subtle",
      )}
    >
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
          <TooltipContent side="bottom">
            Show sidebar<TooltipShortcut>[</TooltipShortcut>
          </TooltipContent>
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
      <h1 id={pageTitleId} className="min-w-0 truncate font-medium text-fg-primary">
        {title}
      </h1>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
