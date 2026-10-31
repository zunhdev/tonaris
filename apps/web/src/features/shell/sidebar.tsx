// The sidebar (DS-30, DS-31): the wordmark, which goes to Collection (TON-119), and a button to hide it, the account
// menu, Search, which opens the search palette (DS-75), and Add album, which opens the capture dialog (DS-48), the
// collection's tree with a "+" menu for new lists and folders, and the SyncIndicator in the footer. Its right edge
// resizes it, by pointer or with the arrow keys, between 200 and 360 px. Collection takes a dragged folder or list, to
// move it to the root (DS-49).

import { AccountMenu } from "@/features/account/account-menu";
import { useCapture } from "@/features/capture/capture-context";
import { CollectionTree } from "@/features/collection/collection-tree";
import { useStartEditor } from "@/features/collection/collection-ui";
import { useDestination } from "@/features/collection/drag";
import { SyncIndicator } from "@/features/sync/sync-indicator";
import { useConnection } from "@/features/sync/sync-provider";
import { Link } from "@tanstack/react-router";
import { PanelLeftClose, Plus, Search } from "lucide-react";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import type { Account, ContainerKind } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@tonaris/ui/components/dropdown-menu";
import { Wordmark } from "@tonaris/ui/components/logo";
import { ScrollArea } from "@tonaris/ui/components/scroll-area";
import { Separator } from "@tonaris/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";
import { cn } from "@tonaris/ui/lib/utils";

import { clampWidth, sidebarWidths } from "./device";
import { useShell } from "./shell-context";

export function Sidebar({
  account,
  width,
  onResize,
}: {
  account: Account;
  width: number;
  onResize: (width: number) => void;
}) {
  const { toggleSidebar, openSearch } = useShell();
  return (
    <nav
      aria-label="Sidebar"
      className="relative flex min-h-0 flex-col border-r border-subtle bg-app"
    >
      <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
        <Link
          to="/c"
          aria-label="Tonaris, go to Collection"
          className="-ml-1.5 flex h-8 items-center rounded-md px-1.5 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
        >
          <Wordmark />
        </Link>
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" aria-label="Hide sidebar" />}
            onClick={toggleSidebar}
          >
            <PanelLeftClose strokeWidth={1.5} aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="right">Hide sidebar [</TooltipContent>
        </Tooltip>
      </div>
      <AccountMenu account={account} />
      <div className="mt-1 flex flex-col gap-0.5 px-2">
        <Button
          variant="ghost"
          className="justify-start"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={openSearch}
        >
          <Search strokeWidth={1.5} aria-hidden />
          Search
          <kbd className="ml-auto text-micro text-fg-tertiary">⌘K</kbd>
        </Button>
        <AddAlbumButton />
      </div>
      <Separator className="my-2" />
      <div className="flex shrink-0 items-center gap-1 pr-2 pl-2">
        <CollectionLink />
        <NewMenu />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-2">
          <CollectionTree />
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-subtle p-2">
        <SyncIndicator />
      </div>
      <ResizeHandle width={width} onResize={onResize} />
    </nav>
  );
}

/** The "+" menu: a new list or folder, where N and ⇧N would make it (DS-78); disabled offline (DS-81). */
function NewMenu() {
  const startEditor = useStartEditor();
  const offline = useConnection() === "offline";
  /** Whether an item was chosen, so the menu leaves the focus with the new name's field. */
  const chosen = useRef(false);

  if (offline) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="New list or folder" aria-disabled />
          }
        >
          <Plus strokeWidth={1.5} aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">You're offline</TooltipContent>
      </Tooltip>
    );
  }

  const choose = (kind: ContainerKind) => {
    chosen.current = true;
    startEditor({ mode: "new", kind });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="New list or folder" />}
      >
        <Plus strokeWidth={1.5} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        finalFocus={() => {
          const keep = !chosen.current;
          chosen.current = false;
          return keep;
        }}
      >
        <DropdownMenuItem onClick={() => choose("list")}>
          New list
          <DropdownMenuShortcut>N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose("folder")}>
          New folder
          <DropdownMenuShortcut>⇧N</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const step = 16;

/** The sidebar's right edge (DS-30): a window splitter, dragged or moved with ← and →, Home and End. */
function ResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number } | undefined>(undefined);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = {
      ArrowLeft: width - step,
      ArrowRight: width + step,
      Home: sidebarWidths.min,
      End: sidebarWidths.max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onResize(clampWidth(next));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    onResize(clampWidth(drag.current.width + event.clientX - drag.current.x));
  }

  // A focusable window splitter, which an `hr` can't be.
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={sidebarWidths.min}
      aria-valuemax={sidebarWidths.max}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        drag.current = undefined;
      }}
      className="absolute top-0 -right-1 bottom-0 w-2 cursor-col-resize outline-none hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
    />
  );
}

/** Collection, the root: a link, and the place a dragged folder or list moves to the top level. */
function CollectionLink() {
  const { setNodeRef, over } = useDestination(null);
  return (
    <Link
      ref={setNodeRef}
      to="/c"
      className={cn(
        "flex h-7 min-w-0 flex-1 items-center rounded-md px-2 text-small font-medium text-fg-tertiary outline-none hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid aria-[current=page]:text-fg-primary",
        over && "bg-accent-soft text-fg-primary",
      )}
    >
      Collection
    </Link>
  );
}

/**
 * Add album: the capture dialog, with manual entry one step further (DS-48). Adding is an edit, so it waits while
 * offline (DS-81).
 */
function AddAlbumButton() {
  const capture = useCapture();
  const offline = useConnection() === "offline";
  if (offline) {
    return (
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" className="justify-start" aria-disabled />}>
          <Plus strokeWidth={1.5} aria-hidden />
          Add album
        </TooltipTrigger>
        <TooltipContent side="right">You're offline</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button
      variant="ghost"
      className="justify-start"
      aria-keyshortcuts="C"
      onClick={() => capture?.openDialog()}
    >
      <Plus strokeWidth={1.5} aria-hidden />
      Add album
    </Button>
  );
}
