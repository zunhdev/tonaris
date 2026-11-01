// A phone's Collection screen, switched to Shared (TON-134; DS-67, DS-110): pending invitations first, as one row to
// the inbox, then each folder or list shared with the person, by name, with its owner, those that can't be opened
// last and dimmed. Each opens its shared view, whose Back returns here.

import { ContainerIcon } from "@/features/collection/icons";
import { buildSharedTree } from "@/features/collection/tree";
import { count } from "@/features/shell/words";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MailOpen, Users } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { usePendingInvitations } from "./pending-invitations";
import { useSharedEntries } from "./shared-entries";

const row =
  "flex min-h-12 items-center gap-2.5 rounded-md px-2 text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus";

export function PhoneShared() {
  const { entries } = useSharedEntries();
  const invitations = usePendingInvitations();
  const items = useMemo(() => buildSharedTree(entries ?? []).roots, [entries]);
  if (!entries) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-2">
      {invitations > 0 && (
        <Link to="/invitations" className={row}>
          <MailOpen strokeWidth={1.5} aria-hidden className="size-4 text-fg-secondary" />
          <span className="flex-1">{count(invitations, "invitation", "invitations")}</span>
          <ChevronRight strokeWidth={1.5} aria-hidden className="size-4 text-fg-tertiary" />
        </Link>
      )}
      {items.length === 0 ? (
        <p className="py-6 text-center text-fg-secondary">
          Nothing is shared with you yet. Invitations you accept and links you add show here.
        </p>
      ) : (
        <ul aria-label="Shared with me" className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to="/shared/$containerId"
                params={{ containerId: item.id }}
                className={cn(row, !item.available && "opacity-60")}
              >
                {item.kind ? (
                  <ContainerIcon kind={item.kind} />
                ) : (
                  <Users strokeWidth={1.5} aria-hidden className="size-4 text-fg-secondary" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {item.name ?? "No longer available"}
                </span>
                <span className="max-w-[40%] shrink-0 truncate text-fg-tertiary">{item.owner}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
