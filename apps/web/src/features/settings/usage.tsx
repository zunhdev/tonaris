// Album capacity (FR-15.1 to FR-15.3, DS-98): the owner's albums against the 5,000 limit, those in Trash counting
// too. Settings → Data shows the meter; capture surfaces show a quiet notice from 95%, and at the limit the reason a
// new album can't be saved, with the ways out. Restoring and re-adding reuse a slot, so they keep working.

import { useCollectionData } from "@/features/collection/data";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";

import { albumCapacityProblem, maxAlbums } from "@tonaris/domain";

export type AlbumUsage = { active: number; trashed: number; total: number; limit: number };

/** The owner's albums, active and in Trash, against the limit. */
export function useAlbumUsage(): AlbumUsage {
  const client = useSyncClient();
  const { albums } = useCollectionData();
  const units = useLiveQuery(() => client?.trashUnits, [client]);
  const trashed = (units.data ?? []).filter((unit) => unit.kind === "album").length;
  return { active: albums, trashed, total: albums + trashed, limit: maxAlbums };
}

const number = new Intl.NumberFormat("en");

/** "4,812 of 5,000 albums · 37 in Trash" (DS-98). */
export function usageLine({ total, trashed, limit }: AlbumUsage): string {
  const used = `${number.format(total)} of ${number.format(limit)} albums`;
  return trashed === 0 ? used : `${used} · ${number.format(trashed)} in Trash`;
}

/** The meter: the line, and a bar split into active and trashed. */
export function UsageMeter() {
  const usage = useAlbumUsage();
  const share = (n: number) => `${Math.min(100, (n / usage.limit) * 100)}%`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-fg-primary">{usageLine(usage)}</p>
      {/* The meter for assistive technology; the bar below draws it split into active and trashed. */}
      <meter
        className="sr-only"
        aria-label="Albums used"
        min={0}
        max={usage.limit}
        value={usage.total}
        aria-valuetext={usageLine(usage)}
      />
      <div aria-hidden className="flex h-2 w-full max-w-md overflow-hidden rounded-full bg-raised">
        <div className="h-full bg-accent-solid" style={{ width: share(usage.active) }} />
        <div className="h-full bg-fg-tertiary" style={{ width: share(usage.trashed) }} />
      </div>
      <p className="text-small text-fg-secondary">
        Albums in Trash count until they are deleted permanently. Restoring an album reuses its
        place.
      </p>
    </div>
  );
}

/**
 * The capture surfaces' notice (DS-98): from 95%, how many are used; at the limit, why nothing new can be saved,
 * with links to Trash and to the usage.
 */
export function CapacityNotice() {
  const usage = useAlbumUsage();
  if (usage.total < usage.limit * 0.95) return null;
  const full = usage.total >= usage.limit;
  return (
    <p
      role={full ? "alert" : undefined}
      className={full ? "text-small text-status-warning" : "text-small text-fg-secondary"}
    >
      {full ? albumCapacityProblem().problem.detail : `${usageLine(usage)}.`}{" "}
      <Link to="/trash" className="text-accent-solid underline-offset-4 hover:underline">
        Open Trash
      </Link>{" "}
      ·{" "}
      <Link to="/settings/data" className="text-accent-solid underline-offset-4 hover:underline">
        See usage
      </Link>
    </p>
  );
}
