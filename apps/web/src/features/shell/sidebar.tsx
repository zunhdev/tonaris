// The sidebar (DS-31): the account menu, then the sections in order as placeholders, with the items that need M2
// (the collection tree, counts, sharing) still to come, and the SyncIndicator in the footer.

import { AccountMenu } from "@/features/account/account-menu";
import { SyncIndicator } from "@/features/sync/sync-indicator";
import { Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";

import type { Account } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { ScrollArea } from "@tonaris/ui/components/scroll-area";
import { Separator } from "@tonaris/ui/components/separator";

const sections = ["Unsorted", "Shared with me", "Trash"];

export function Sidebar({ account }: { account: Account }) {
  return (
    <nav aria-label="Sidebar" className="flex min-h-0 flex-col border-r border-subtle bg-app">
      <div className="flex h-12 shrink-0 items-center px-4">
        <span className="text-title text-fg-primary">Tonaris</span>
      </div>
      <AccountMenu account={account} />
      <div className="mt-1 flex flex-col gap-0.5 px-2">
        <Button variant="ghost" className="justify-start" disabled>
          <Search strokeWidth={1.5} aria-hidden />
          Search
          <kbd className="ml-auto text-micro text-fg-tertiary">⌘K</kbd>
        </Button>
        <Button variant="ghost" className="justify-start" disabled>
          <Plus strokeWidth={1.5} aria-hidden />
          Add album
        </Button>
      </div>
      <Separator className="my-2" />
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-0.5 px-2">
          <li>
            <Link
              to="/c"
              className="flex h-7 items-center rounded-md px-2.5 font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary aria-[current=page]:bg-selected aria-[current=page]:text-fg-primary"
            >
              Collection
            </Link>
          </li>
          {sections.map((section) => (
            <li key={section} className="flex h-7 items-center px-2.5 text-fg-tertiary">
              {section}
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div className="shrink-0 border-t border-subtle p-2">
        <SyncIndicator />
      </div>
    </nav>
  );
}
