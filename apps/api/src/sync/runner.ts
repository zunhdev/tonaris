// The API's mutation runner (TS-20, TS-22): how `POST /v1/mutations`, `POST /v1/batches` and MCP's writes run an
// envelope, and hand on what it changed. Most mutations run by `executeMutation` as they are; a few need work the
// commands can't do themselves:
// - a new share link's token is derived with the server's secret, which commands never see (TS-32);
// - a link edit's URL is read before the owner's write lock (TON-46);
// - a capture is claimed first, so a copy sent while it runs answers `409 in_progress` and nothing runs twice, held to
//   100 an hour, and asks its providers before the lock (TS-41, ../capture.ts);
// - a saved invitation's email is queued after the response (FR-07.5).
// After commit, `announce` hands the changes to the account's streams (TS-23).

import {
  capturesSince,
  claimMutation,
  executeMutation,
  finishMutation,
  releaseClaim,
  type Database,
  type ExecutedMutation,
} from "@tonaris/db";
import {
  actingUserId,
  failure,
  maxCapturesPerHour,
  shareInviteResultSchema,
  shareToken,
  shareTokenHash,
  type EmailPort,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { prepareCapture, prepareLink, type CaptureDeps } from "../capture";
import { deliverInvitation } from "../invitations";
import type { LogError } from "../observability";
import type { SyncHub } from "./hub";

/** Thrown when a mutation is claimed by another request that is still running it (TS-22). */
export class MutationInProgressError extends Error {
  constructor(readonly mutationId: string) {
    super("This change is still being saved.");
  }
}

/** What the runner needs besides the database. */
export type MutationRunnerDeps = {
  /** What captures ask (TS-41); without it, a capture fails as `provider_unavailable`. */
  capture?: CaptureDeps | undefined;
  /** Derives link tokens (TS-32). */
  shareSecret: string;
  /** Sends invitations (TS-72), with the web app's origin for their links. */
  email: EmailPort;
  webOrigin: string;
  logError: LogError;
};

/** Runs one mutation for `principal`, as the API does. Throws `MutationInProgressError` while a copy runs. */
export type MutationRunner = (
  principal: Principal,
  mutation: Mutation,
) => Promise<ExecutedMutation>;

const tooManyCaptures = failure(
  "rate_limited",
  `You've added ${maxCapturesPerHour} albums from links in the last hour. Try again later, or enter an album manually.`,
);

/** What an invitation's command answers when its email should go out (FR-07.5). */
const invitationResult = shareInviteResultSchema.pick({ grantId: true, emailing: true });

/**
 * Runs a mutation as the API does: a capture claimed, prepared and then saved; a link edit with its URL read first;
 * a new share link with its token's hash; anything else by `executeMutation`. A saved invitation's email is queued
 * after; a replay never sends again (FR-07.5).
 */
export function mutationRunner(db: Database, deps: MutationRunnerDeps): MutationRunner {
  return async function runAndDeliver(principal, mutation) {
    const executed = await run(db, deps, principal, mutation);
    const { outcome } = executed.result;
    if (
      (mutation.name === "share.invite" || mutation.name === "share.resendInvitation") &&
      !executed.replayed &&
      outcome.status === "confirmed"
    ) {
      const invited = invitationResult.safeParse(outcome.result);
      if (invited.success && invited.data.emailing) {
        const { email, webOrigin, logError } = deps;
        void deliverInvitation({ db, email, webOrigin }, invited.data.grantId).catch(
          (error: unknown) => logError(error, "invitation email"),
        );
      }
    }
    return executed;
  };
}

async function run(
  db: Database,
  { capture, shareSecret }: MutationRunnerDeps,
  principal: Principal,
  mutation: Mutation,
): Promise<ExecutedMutation> {
  // A new link's token is derived with the server's secret, which commands never see: its hash goes in (TS-32).
  if (mutation.name === "share.setLink" && mutation.args.enabled) {
    const hash = await shareTokenHash(await shareToken(shareSecret, mutation.args.linkId));
    return executeMutation(db, principal, mutation, undefined, { shareLink: { hash } });
  }
  if (mutation.name === "link.set") {
    const link = await prepareLink(mutation.args.url, capture?.readLink);
    return executeMutation(db, principal, mutation, undefined, { link });
  }
  if (mutation.name !== "album.capture") return executeMutation(db, principal, mutation);
  const claim = await claimMutation(db, principal, mutation);
  if (claim.status === "answered") return claim.executed;
  if (claim.status === "in_progress") throw new MutationInProgressError(mutation.mutationId);
  // At most 100 captures an hour, from the app or MCP (TS-18), refused before any provider is asked.
  const ownerId = actingUserId(principal);
  if (
    ownerId &&
    (await capturesSince(db, ownerId, new Date(Date.now() - 3_600_000), mutation.mutationId)) >=
      maxCapturesPerHour
  ) {
    return finishMutation(db, principal, mutation, tooManyCaptures);
  }
  try {
    const prepared = await prepareCapture(db, capture, principal, mutation.args);
    if ("outcome" in prepared) {
      return await finishMutation(db, principal, mutation, prepared.outcome);
    }
    return await executeMutation(db, principal, mutation, undefined, {
      claimed: true,
      capture: prepared.source,
    });
  } catch (error) {
    // An unexpected failure leaves nothing claimed, so sending it again runs it.
    await releaseClaim(db, principal, mutation.mutationId);
    throw error;
  }
}

/**
 * Hands a write's changes to the account's streams once it committed. A confirmed write with none, such as sharing or
 * the display name, still tells the account's guest pages to read again (TS-23, TON-70).
 */
export function announcer(hub: Pick<SyncHub, "publish" | "notify">) {
  return (accountId: string, { result, changes, replayed }: ExecutedMutation): void => {
    if (changes.length > 0) hub.publish(accountId, changes);
    else if (!replayed && result.outcome.status === "confirmed") hub.notify(accountId);
  };
}

/** The path every write takes, from the app and MCP alike (X-02): run, then announce. */
export type Mutations = {
  run: MutationRunner;
  announce: (accountId: string, executed: ExecutedMutation) => void;
};
