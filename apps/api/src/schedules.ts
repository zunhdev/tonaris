// Periodic jobs in the API process (TS-90, TS-91). Each runs on its interval, in one transaction holding an
// advisory lock named after it, so a second instance skips a run rather than overlapping it. Queued jobs with
// retries (the `jobs` table) arrive with the work that needs them, such as email retries and MusicBrainz lookups.

import {
  pruneProviderCache,
  pruneSyncHistory,
  runExclusively,
  type Database,
  type Transaction,
} from "@tonaris/db";
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
export function apiSchedules(spotify: Pick<Spotify, "album"> | undefined): Schedule[] {
  return [
    pruneSyncHistorySchedule,
    pruneProviderCacheSchedule,
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
