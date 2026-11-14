// What the person shares, for the glyph beside each of their folders and lists (DS-27, DS-31, DS-41; TON-227):
// people, a link, or both, from `GET /v1/sharing`, and dimmer when the sharing comes from a folder above, which the
// tree tells. Read once while anything shows a glyph, again after each change in the sharing dialog, and when the
// window comes back into view, as a change made on another device can't be heard otherwise.

import { api } from "@/api";
import { useCollectionData } from "@/features/collection/data";
import { ancestorsOf } from "@/features/collection/tree";
import { Link2, Users } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import type { OwnSharing } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

type Kinds = { people: boolean; link: boolean };

const nothing: ReadonlyMap<string, Kinds> = new Map();
let shared: ReadonlyMap<string, Kinds> = nothing;
const listeners = new Set<() => void>();
let reading = false;
let again = false;

/** Reads what the person shares; a read asked for during one follows it. */
function read(): void {
  if (reading) {
    again = true;
    return;
  }
  reading = true;
  void api.v1.sharing
    .get()
    .then(({ data }) => {
      if (!data) return undefined;
      shared = new Map(
        data.shared.map(({ containerId, people, link }: OwnSharing["shared"][number]) => [
          containerId,
          { people, link },
        ]),
      );
      for (const listener of listeners) listener();
      return undefined;
    })
    .catch(() => {})
    .finally(() => {
      reading = false;
      if (again) {
        again = false;
        read();
      }
    });
}

/** The person's sharing changed here: reads it again. The sharing dialog says so after each change. */
export function sharingChanged(): void {
  if (listeners.size > 0) read();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) read();
  return () => listeners.delete(listener);
}

/** What the person shares directly, by folder or list. */
function useOwnSharing(): ReadonlyMap<string, Kinds> {
  const value = useSyncExternalStore(
    subscribe,
    () => shared,
    () => nothing,
  );
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return value;
}

/** How `containerId` is shared: by itself, through a folder above (the kinds of all of them), or not at all. */
export function useSharingOf(containerId: string): (Kinds & { inherited: boolean }) | undefined {
  const sharing = useOwnSharing();
  const { tree } = useCollectionData();
  const own = sharing.get(containerId);
  if (own) return { ...own, inherited: false };
  const above = ancestorsOf(tree, containerId).flatMap((folder) => sharing.get(folder.id) ?? []);
  if (above.length === 0) return undefined;
  return {
    people: above.some((each) => each.people),
    link: above.some((each) => each.link),
    inherited: true,
  };
}

/** The words for the glyph, which is its accessible name and its tooltip. */
export function sharingWords({ people, link, inherited }: Kinds & { inherited: boolean }): string {
  const how = people && link ? "with people and by link" : people ? "with people" : "by link";
  return inherited ? `Shared ${how} through a folder above` : `Shared ${how}`;
}

/**
 * The glyph beside one of the person's own folders or lists: people, a link, or both, in `fg.tertiary`, at half
 * strength when the sharing comes from a folder above. Nothing when it isn't shared.
 */
export function SharingGlyph({
  containerId,
  className,
}: {
  containerId: string;
  className?: string;
}) {
  const sharing = useSharingOf(containerId);
  if (!sharing) return null;
  const words = sharingWords(sharing);
  return (
    <span
      title={words}
      data-slot="sharing-glyph"
      data-inherited={sharing.inherited || undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-fg-tertiary data-inherited:opacity-50",
        className,
      )}
    >
      {sharing.people && <Users aria-hidden strokeWidth={1.5} className="size-3.5" />}
      {sharing.link && <Link2 aria-hidden strokeWidth={1.5} className="size-3.5" />}
      {/* Read after the name, as ", shared by link". */}
      <span className="sr-only">, {words.charAt(0).toLowerCase() + words.slice(1)}</span>
    </span>
  );
}
