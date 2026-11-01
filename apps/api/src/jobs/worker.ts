// The job worker (TS-90): runs queued jobs in the API process, a few at a time. Queuing a job wakes it, so work
// starts at once; it also looks for due jobs every few seconds, for retries, a restart's leftovers, and jobs another
// instance queued. A failed job runs again after 5 s, 30 s and 2 min, unless its handler says retrying can't help;
// then it is buried, after its handler records the failure and says what of its payload to keep.

import { buryJob, claimJob, finishJob, retryJob, type Database, type JobRow } from "@tonaris/db";

import type { LogError } from "../observability";

export type JobHandler = {
  kind: string;
  /** Does the job; a rejection is a failure. */
  run(job: JobRow): Promise<void>;
  /** Whether `error` is worth another attempt (default: yes). */
  retryable?(error: unknown): boolean;
  /** Records that the job gave up after `error`, and answers what to keep of its payload. */
  buried(job: JobRow, error: unknown): Promise<unknown>;
};

export type JobWorkerOptions = {
  /** How many jobs run at once. */
  concurrency?: number;
  /** How often to look for due jobs, besides being woken. */
  pollMs?: number;
  /** How long a claimed job is held: a worker that stops responding lets it go after this. */
  leaseMs?: number;
  /** The waits before each retry; a job runs at most one more time than there are waits. */
  retryDelaysMs?: readonly number[];
  logError?: LogError;
};

export type JobWorker = {
  /** Looks for due jobs now: call it after queuing one. */
  wake: () => void;
  /** Stops taking jobs, and waits for the ones running. */
  stop: () => Promise<void>;
};

export const jobRetryDelaysMs = [5_000, 30_000, 120_000] as const;

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function startJobWorker(
  db: Database,
  handlers: readonly JobHandler[],
  {
    concurrency = 2,
    pollMs = 5_000,
    leaseMs = 120_000,
    retryDelaysMs = jobRetryDelaysMs,
    logError = (error, context) => console.error(`Failed: ${context}`, error),
  }: JobWorkerOptions = {},
): JobWorker {
  const byKind = new Map(handlers.map((handler) => [handler.kind, handler]));
  const kinds = [...byKind.keys()];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  /** The lanes running now, each taking due jobs one after another until none is left. */
  const lanes = new Set<Promise<void>>();
  let wokenWhileFull = false;

  /** Claims and runs one due job; answers whether there was one. */
  const runOne = async (): Promise<boolean> => {
    const job = await claimJob(db, { kinds, now: new Date(), leaseMs });
    if (!job) return false;
    const handler = byKind.get(job.kind);
    if (!handler) return true;
    try {
      await handler.run(job);
      await finishJob(db, job.id);
    } catch (error) {
      const delay = retryDelaysMs[job.attempts - 1];
      if (delay !== undefined && (handler.retryable?.(error) ?? true)) {
        await retryJob(db, job.id, {
          runAt: new Date(Date.now() + delay),
          error: describe(error),
        });
        later(delay);
      } else {
        const payload = await handler.buried(job, error);
        await buryJob(db, job.id, { error: describe(error), payload, now: new Date() });
        logError(error, `${job.kind} job ${job.id}, after ${job.attempts} attempts`);
      }
    }
    return true;
  };

  /** Runs due jobs one after another until none is left. */
  const lane = async (): Promise<void> => {
    if (!stopped && (await runOne())) await lane();
  };

  // A lane that has finished is started again as soon as there is work, even while another still runs a long job,
  // so one slow job never holds up the rest (TON-102).
  const wake = () => {
    if (stopped) return;
    // Every lane busy: one of them may already have looked, so look again once one is done.
    if (lanes.size >= concurrency) {
      wokenWhileFull = true;
      return;
    }
    while (lanes.size < concurrency) {
      const running: Promise<void> = lane()
        .catch((error: unknown) => logError(error, "job worker"))
        .finally(() => {
          lanes.delete(running);
          if (wokenWhileFull) {
            wokenWhileFull = false;
            wake();
          }
        });
      lanes.add(running);
    }
  };

  /** Wakes the worker after `ms`, when a retry is due. */
  const later = (ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      wake();
    }, ms);
    timer.unref();
    timers.add(timer);
  };

  const poll = setInterval(wake, pollMs);
  poll.unref();
  wake();

  return {
    wake,
    stop: async () => {
      stopped = true;
      clearInterval(poll);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await Promise.all(lanes);
    },
  };
}
