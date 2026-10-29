// Email through the job queue (TS-72, TS-90) against the local Postgres 18 (TS-121): the job sends through the
// adapter with its own id as the idempotency key, records the outcome on the invitation, drops a code that expired,
// and keeps no code or token once it gives up.

import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import { admissionInvitations, jobs } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { EmailDeliveryError, type EmailOptions, type EmailPort } from "@tonaris/domain";

import { startJobWorker, type JobWorker } from "../jobs";
import { insertUser, inviteForTest } from "../testing";
import { emailJob, emailOutbox } from "./outbox";

let t: TestDatabase;
let worker: JobWorker | undefined;
let creator: string;

beforeEach(async () => {
  t = await createTestDatabase();
  creator = await insertUser(t.db, "creator@example.com", { role: "creator" });
});

afterEach(async () => {
  await worker?.stop();
  worker = undefined;
  await t.drop();
});

type Sent = { template: string; to: string; options: EmailOptions | undefined };

/** An adapter that fails with `failures` in turn, then sends. */
function adapter(failures: Error[] = []) {
  const sent: Sent[] = [];
  const port: EmailPort = {
    async send(template, to, _data, options) {
      const failure = failures.shift();
      if (failure) throw failure;
      sent.push({ template, to, options });
    },
  };
  return { port, sent };
}

function start(port: EmailPort) {
  worker = startJobWorker(t.db, [emailJob(t.db, port)], {
    pollMs: 60_000,
    retryDelaysMs: [10, 10],
    logError: () => {},
  });
  return emailOutbox(t.db, worker.wake);
}

/** Admission invitations whose email is sending, as the creator's admin starts them (TON-74). */
async function sendingInvitations(...addresses: string[]): Promise<string[]> {
  const ids = [];
  for (const email of addresses) {
    // oxlint-disable-next-line no-await-in-loop
    ids.push((await inviteForTest(t.db, { email, createdBy: creator })).id);
  }
  await t.db.update(admissionInvitations).set({ emailStatus: "sending" });
  return ids;
}

/** The invitation's email status once it is no longer sending. */
async function emailStatus(id: string): Promise<string | null | undefined> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await t.db.select().from(admissionInvitations);
    const status = rows.find((row) => row.id === id)?.emailStatus;
    if (status !== "sending" || Date.now() > deadline) return status;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(5);
  }
}

/** The queue's one job, once it is dead. */
async function deadJob() {
  const deadline = Date.now() + 2_000;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop
    const [row] = await t.db.select().from(jobs);
    if (row?.deadAt || Date.now() > deadline) return row;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(5);
  }
}

const invitation = { link: "http://localhost:3000/join/token" };
const timeout = () =>
  new EmailDeliveryError("Resend didn't answer in time.", { retryable: true, uncertain: true });

describe("the email job (TS-72)", () => {
  test("sends through the adapter, keyed by the job, and records the email as sent", async () => {
    const { port, sent } = adapter();
    const email = start(port);
    const [id] = await sendingInvitations("anna@example.com");
    await email.send("admission-invitation", "anna@example.com", invitation, {
      outcome: { kind: "admission_invitation", id: id! },
    });
    expect(await emailStatus(id!)).toBe("sent");
    expect(sent).toEqual([
      {
        template: "admission-invitation",
        to: "anna@example.com",
        options: { idempotencyKey: expect.any(String) },
      },
    ]);
    expect(await t.db.select().from(jobs)).toEqual([]);
  });

  test("a retry after a timeout uses the same key, so the provider sends it once", async () => {
    const { port, sent } = adapter([timeout()]);
    const email = start(port);
    const [id] = await sendingInvitations("anna@example.com");
    await email.send("admission-invitation", "anna@example.com", invitation, {
      outcome: { kind: "admission_invitation", id: id! },
    });
    expect(await emailStatus(id!)).toBe("sent");
    expect(sent).toHaveLength(1);
  });

  test("a refusal fails at once; timeouts to the last are unconfirmed (FR-07.5)", async () => {
    const refused = adapter([
      new EmailDeliveryError("Resend refused the email", { retryable: false }),
    ]);
    const [first, second] = await sendingInvitations("anna@example.com", "ben@example.com");
    let email = start(refused.port);
    await email.send("admission-invitation", "anna@example.com", invitation, {
      outcome: { kind: "admission_invitation", id: first! },
    });
    expect(await emailStatus(first!)).toBe("failed");
    await worker?.stop();

    const unanswered = adapter([timeout(), timeout(), timeout()]);
    email = start(unanswered.port);
    await email.send("admission-invitation", "ben@example.com", invitation, {
      outcome: { kind: "admission_invitation", id: second! },
    });
    expect(await emailStatus(second!)).toBe("unknown");
    expect(unanswered.sent).toEqual([]);
  });

  test("an email given up keeps neither its code nor its link", async () => {
    const { port } = adapter([
      new EmailDeliveryError("Resend refused the email", { retryable: false }),
    ]);
    const email = start(port);
    await email.send("join-code", "anna@example.com", {
      code: "123456",
      link: "http://localhost:3000/join/token#code=123456",
    });
    expect(await deadJob()).toMatchObject({
      payload: { template: "join-code", to: "anna@example.com" },
      lastError: "Resend refused the email",
    });
  });

  test("a code's email isn't sent once the code has expired", async () => {
    const { port, sent } = adapter();
    const email = start(port);
    await worker?.stop();
    await email.send("sign-in-code", "anna@example.com", { code: "123456", link: "http://x" });
    // The worker is back only after the code's 10 minutes.
    setSystemTime(new Date(Date.now() + 11 * 60_000));
    try {
      start(port);
      expect((await deadJob())?.lastError).toBe(
        "The email's code expired before it could be sent.",
      );
    } finally {
      setSystemTime();
    }
    expect(sent).toEqual([]);
  });
});
