// Periodic jobs in the API process (TS-90, TS-91). Each runs on its interval, in one transaction holding an
// advisory lock named after it, so a second instance skips a run rather than overlapping it. Queued jobs with
// retries (the `jobs` table) arrive with the work that needs them, such as email retries and MusicBrainz lookups.

import { pruneSyncHistory, runExclusively, type Database, type Transaction } from "@tonaris/db";

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
