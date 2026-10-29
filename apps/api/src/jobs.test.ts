// The job worker (TS-90) against the local Postgres 18 (TS-121): a queued job runs as soon as the worker is woken,
// a failure is retried after its wait and buried when the waits run out or retrying can't help, and stopping waits
// for the job in progress.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { enqueueJob, jobs } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { uuidv7 } from "@tonaris/domain";

import { startJobWorker, type JobHandler, type JobWorker } from "./jobs";

let t: TestDatabase;
let worker: JobWorker | undefined;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await worker?.stop();
  worker = undefined;
  await t.drop();
});

class Hopeless extends Error {}

/** A handler that fails while `failures` lasts, and keeps what happened. */
function handler(failures: Error[] = []) {
  const runs: { attempts: number; at: number }[] = [];
  const burials: { error: unknown; payload: unknown }[] = [];
  const start = Date.now();
  const recording: JobHandler = {
    kind: "test",
    async run(job) {
      runs.push({ attempts: job.attempts, at: Date.now() - start });
      const failure = failures.shift();
      if (failure) throw failure;
    },
    retryable: (error) => !(error instanceof Hopeless),
    async buried(job, error) {
      burials.push({ error, payload: job.payload });
      return { kept: "this" };
    },
  };
  return { handler: recording, runs, burials };
}

const queue = async (payload: unknown = {}) => {
  const id = uuidv7();
  await enqueueJob(t.db, { id, kind: "test", payload });
  return id;
};

/** Waits until `condition` holds, refreshing what it reads with `refresh` between looks. */
async function until(
  condition: () => boolean,
  ms = 2_000,
  refresh: () => Promise<void> = () => Bun.sleep(5),
) {
  const deadline = Date.now() + ms;
  // oxlint-disable-next-line no-await-in-loop
  while (!condition() && Date.now() < deadline) await refresh();
}

describe("startJobWorker", () => {
  test("runs a queued job as soon as it is woken, then deletes it", async () => {
    const recorder = handler();
    worker = startJobWorker(t.db, [recorder.handler], { pollMs: 60_000 });
    await queue();
    worker.wake();
    await until(() => recorder.runs.length === 1);
    expect(recorder.runs).toEqual([{ attempts: 1, at: expect.any(Number) }]);
    await until(() => false, 50);
    expect(await t.db.select().from(jobs)).toEqual([]);
  });

  test("runs the jobs left from before it started", async () => {
    await queue();
    const recorder = handler();
    worker = startJobWorker(t.db, [recorder.handler], { pollMs: 60_000 });
    await until(() => recorder.runs.length === 1);
    expect(recorder.runs).toHaveLength(1);
  });

  test("retries a failure after each wait, then buries it, keeping what the handler says", async () => {
    const recorder = handler([new Error("down"), new Error("down"), new Error("still down")]);
    worker = startJobWorker(t.db, [recorder.handler], {
      pollMs: 60_000,
      retryDelaysMs: [30, 60],
      logError: () => {},
    });
    await queue({ secret: "123456" });
    worker.wake();
    let rows = await t.db.select().from(jobs);
    await until(
      () => Boolean(rows[0]?.deadAt),
      2_000,
      async () => {
        rows = await t.db.select().from(jobs);
      },
    );

    expect(recorder.runs.map((run) => run.attempts)).toEqual([1, 2, 3]);
    const [first, second, third] = recorder.runs.map((run) => run.at);
    expect(second! - first!).toBeGreaterThanOrEqual(30);
    expect(third! - second!).toBeGreaterThanOrEqual(60);
    expect(recorder.burials).toEqual([
      { error: new Error("still down"), payload: { secret: "123456" } },
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ attempts: 3, lastError: "still down", payload: { kept: "this" } }),
    ]);
  });

  test("a failure retrying can't help is buried at once", async () => {
    const recorder = handler([new Hopeless("refused")]);
    worker = startJobWorker(t.db, [recorder.handler], {
      pollMs: 60_000,
      retryDelaysMs: [10],
      logError: () => {},
    });
    await queue();
    worker.wake();
    await until(() => recorder.burials.length === 1);
    expect(recorder.runs).toHaveLength(1);
  });

  test("stopping waits for the job in progress, and takes no more", async () => {
    let finish: (() => void) | undefined;
    const started: string[] = [];
    const slow: JobHandler = {
      kind: "test",
      run: (job) => {
        started.push(job.id);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      buried: async () => ({}),
    };
    worker = startJobWorker(t.db, [slow], { pollMs: 60_000, concurrency: 1 });
    const id = await queue();
    worker.wake();
    await until(() => started.length === 1);
    await queue();

    let stopped = false;
    const stopping = (async () => {
      await worker.stop();
      stopped = true;
    })();
    await Bun.sleep(20);
    expect(stopped).toBe(false);
    finish?.();
    await stopping;
    expect(started).toEqual([id]);
    expect(await t.db.select({ id: jobs.id }).from(jobs)).toHaveLength(1);
  });
});
