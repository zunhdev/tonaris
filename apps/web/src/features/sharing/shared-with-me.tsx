// Shared with me (DS-67, FR-07.13): the folders and lists the person keeps, grouped by owner display name, each marked
// as shared by invitation or saved from a link. One that no longer works is dimmed, "No longer available", with
// Remove. An invitation-based one offers Leave share…, confirming that the owner would have to invite again; a
// link-saved one, Remove from Shared with me. The entries are the workspace's (shared-entries.tsx), read again after
// a change here. An available one opens in the app, view-only (shared-view.tsx).

import { PageHeader } from "@/features/shell/page-header";
import { useConnection } from "@/features/sync/sync-provider";
import { Link } from "@tanstack/react-router";
import { Link2, Users } from "lucide-react";
import { useState } from "react";

import type { SharedEntry } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

import { useSend, type Unsent } from "./send";
import { useSharedEntries } from "./shared-entries";

export function SharedWithMeView() {
  const { entries, reread } = useSharedEntries();
  const groups = new Map<string, SharedEntry[]>();
  for (const entry of entries ?? []) {
    const owner = entry.owner.displayName ?? "A Tonaris member";
    groups.set(owner, [...(groups.get(owner) ?? []), entry]);
  }
  return (
    <>
      <PageHeader title="Shared with me" back={{ to: "/c", label: "Collection" }} />
      <div className="flex max-w-3xl flex-col gap-6 p-6">
        {entries?.length === 0 && (
          <p className="text-fg-secondary">
            Nothing is shared with you yet. Invitations you accept and links you add show here.
          </p>
        )}
        {[...groups].map(([owner, owned]) => (
          <section key={owner} aria-label={`Shared by ${owner}`} className="flex flex-col gap-1">
            <h2 className="text-small font-medium text-fg-tertiary">{owner}</h2>
            <ul className="flex flex-col">
              {owned.map((entry) => (
                <SharedRow key={entry.containerId} entry={entry} onChanged={reread} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function SharedRow({ entry, onChanged }: { entry: SharedEntry; onChanged: () => void }) {
  const offline = useConnection() === "offline";
  const [confirming, setConfirming] = useState(false);
  const { run: send, busy, error } = useSend();
  const name = entry.name ?? "A shared folder or list";
  const owner = entry.owner.displayName ?? "Its owner";
  const run = async (mutation: Unsent) => {
    await send(mutation);
    setConfirming(false);
    onChanged();
  };
  const remove = () =>
    void run({ name: "share.removeReference", args: { containerId: entry.containerId } });
  return (
    <li className="flex flex-col gap-2 border-b border-subtle py-2">
      <div className={cn("flex items-center gap-3", !entry.available && "opacity-60")}>
        <span className="flex shrink-0 gap-1 text-fg-secondary">
          {entry.via.invitation && <Users strokeWidth={1.5} aria-hidden className="size-4" />}
          {entry.via.link && <Link2 strokeWidth={1.5} aria-hidden className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {entry.available ? (
            <Link
              to="/shared/$containerId"
              params={{ containerId: entry.containerId }}
              className="truncate text-fg-primary hover:underline"
            >
              {entry.name ? `"${entry.name}"` : name}
            </Link>
          ) : (
            <span className="truncate text-fg-primary">{name}</span>
          )}
          <span className="text-small text-fg-secondary">
            {entry.available
              ? [
                  entry.kind === "folder" ? "Folder" : "List",
                  entry.via.invitation ? "by invitation" : undefined,
                  entry.via.link ? "from a link" : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "No longer available"}
          </span>
        </span>
        {!entry.available ? (
          <Button variant="secondary" disabled={busy || offline} onClick={remove}>
            Remove
          </Button>
        ) : entry.via.invitation ? (
          <Button
            variant="secondary"
            disabled={busy || offline}
            aria-expanded={confirming}
            onClick={() => setConfirming(true)}
          >
            Leave share…
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy || offline} onClick={remove}>
            Remove from Shared with me
          </Button>
        )}
      </div>
      {confirming && (
        <div className="flex flex-col gap-2 rounded-md bg-panel p-3">
          <p className="text-base text-fg-primary">
            Leave {entry.name ? `"${entry.name}"` : "this share"}? {owner} would have to invite you
            again.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run({ name: "share.leave", args: { containerId: entry.containerId } })
              }
            >
              Leave
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error !== undefined && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </li>
  );
}
