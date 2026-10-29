// Periodic jobs in the API process (TS-90, TS-91). Each runs on its interval, in one transaction holding an
// advisory lock named after it, so a second instance skips a run rather than overlapping it. Queued jobs with
// retries, such as email, run in the job worker (src/jobs.ts).

import {
  expireAdmissionInvitations,
  pruneDeadJobs,
  pruneProviderCache,
  pruneSyncHistory,
  purgeExpiredTrash,
  runExclusively,
  type Database,
  type Transaction,
} from "@tonaris/db";
import type { Change } from "@tonaris/domain";
import type { Spotify } from "@tonaris/providers";

export type Schedule = {
  /** Names the advisory lock too, so it must be unique. */
  name: string;
  everyMs: number;
  run(tx: Transaction, now: Date): Promise<void>;
};

const day = 86_400_000;

/** Change-log entries and idempotency records older than 30 days (TS-22, TS-23). */
export const pruneSyncHistorySchedule: Schedule = {
  name: "prune-sync-history",
  everyMs: day,
  run: (tx, now) => pruneSyncHistory(tx, now),
};

/** Provider answers past their 7 days (TS-41), so the cache doesn't grow without end. */
export const pruneProviderCacheSchedule: Schedule = {
  name: "prune-provider-cache",
  everyMs: day,
  run: (tx, now) => pruneProviderCache(tx, now),
};

/** Jobs that gave up more than 30 days ago (TS-90). */
export const pruneDeadJobsSchedule: Schedule = {
  name: "prune-dead-jobs",
  everyMs: day,
  run: (tx, now) => pruneDeadJobs(tx, now),
};

/** Admission invitations past their 14 days, recorded as expired (TS-91); use checks expiry already (TS-71). */
export const expireAdmissionInvitationsSchedule: Schedule = {
  name: "expire-admission-invitations",
  everyMs: day,
  run: (tx, now) => expireAdmissionInvitations(tx, now),
};

/**
 * The hourly Trash expiry (TS-91; FR-01.17, FR-14.5): units past their 30 days are purged, each owner's in a
 * transaction of its own under the owner's write lock, and their changes published to the owner's streams once
 * committed. The schedule's own lock keeps a second instance from purging at the same time.
 */
export function trashExpirySchedule(
  db: Database,
  publish: (accountId: string, changes: readonly Change[]) => void,
): Schedule {
  return {
    name: "trash-expiry",
    everyMs: 3_600_000,
    async run(_tx, now) {
      for (const { accountId, changes } of await purgeExpiredTrash(db, now)) {
        publish(accountId, changes);
      }
    },
  };
}

/** *Random Access Memories* on Spotify: an album with a UPC that won't go away. */
export const spotifyHealthAlbum = "4m2880jivSbbyEGAKfITCa";

/**
 * TS-41's daily health check of the Spotify bridge: one Get Album call shows the token works (the owner's Premium
 * subscription) and that a UPC still comes back, and keeps the app in use (Spotify's Terms IX.8.e). A failure is
 * logged naming no Spotify value; the bridge's lookups then fail as unavailable until it is fixed or turned off.
 */
export function spotifyHealthSchedule(
  spotify: Pick<Spotify, "album">,
  log: (message: string) => void = console.error,
): Schedule {
  return {
    name: "spotify-health",
    everyMs: day,
    async run() {
      let upc: string | undefined;
      try {
        upc = (await spotify.album(spotifyHealthAlbum))?.upc;
      } catch (error) {
        log(
          `Spotify health check failed: ${error instanceof Error ? error.message : "unknown error"}.`,
        );
        return;
      }
      if (!upc)
        log(
          "Spotify health check failed: Get Album returned no UPC, so the bridge can't search barcodes.",
        );
    },
  };
}

/** Every schedule the API runs; the Spotify health check only while the bridge is on. */
export function apiSchedules(
  spotify: Pick<Spotify, "album"> | undefined,
  trash: { db: Database; publish: (accountId: string, changes: readonly Change[]) => void },
): Schedule[] {
  return [
    pruneSyncHistorySchedule,
    pruneProviderCacheSchedule,
    pruneDeadJobsSchedule,
    expireAdmissionInvitationsSchedule,
    trashExpirySchedule(trash.db, trash.publish),
    ...(spotify ? [spotifyHealthSchedule(spotify)] : []),
  ];
}

/** Runs `schedule` once, unless another instance is running it. Answers whether it ran. */
export function runSchedule(
  db: Database,
  schedule: Schedule,
  now: Date = new Date(),
): Promise<boolean> {
  return runExclusively(db, schedule.name, (tx) => schedule.run(tx, now));
}

export type ScheduleOptions = {
  /** How long after the start each schedule first runs, so the start isn't slowed. */
  firstAfterMs?: number;
  logError?: (error: unknown, schedule: string) => void;
};

/** Runs each schedule after `firstAfterMs`, then every `everyMs`. `stop()` waits for the runs in progress. */
export function startSchedules(
  db: Database,
  schedules: readonly Schedule[],
  {
    firstAfterMs = 60_000,
    logError = (error, schedule) => console.error(`Schedule ${schedule} failed`, error),
  }: ScheduleOptions = {},
) {
  const starts: ReturnType<typeof setTimeout>[] = [];
  const repeats: ReturnType<typeof setInterval>[] = [];
  const running = new Set<Promise<void>>();
  let stopped = false;

  const fire = (schedule: Schedule) => {
    if (stopped) return;
    const run: Promise<void> = runSchedule(db, schedule)
      .then(() => undefined)
      .catch((error: unknown) => logError(error, schedule.name))
      .finally(() => running.delete(run));
    running.add(run);
  };
  for (const schedule of schedules) {
    starts.push(
      setTimeout(() => {
        fire(schedule);
        repeats.push(setInterval(() => fire(schedule), schedule.everyMs));
      }, firstAfterMs),
    );
  }

  return {
    async stop(): Promise<void> {
      stopped = true;
      for (const timer of starts) clearTimeout(timer);
      for (const timer of repeats) clearInterval(timer);
      await Promise.all(running);
    },
  };
}
