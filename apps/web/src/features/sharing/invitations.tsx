// Sharing invitations, for their recipient (DS-66; FR-07.5, FR-07.6): the inbox of pending ones, each with the owner's
// display name, the collection's name and type, and the date, to accept or decline; and the page an invitation's
// email links to, which shows that invitation, says when it is someone else's or no longer available, and confirms
// one already accepted. Answering is online-only and goes straight to the API, as sharing does.

import { api } from "@/api";
import { PageHeader, toCollection } from "@/features/shell/page-header";
import { useConnection } from "@/features/sync/sync-provider";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import type { Invitation, InvitationState } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";

import { refreshPendingInvitations } from "./pending-invitations";
import { useSend } from "./send";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** "Doom", a list from Denis, invited 29 Oct 2026. */
function Summary({ invitation }: { invitation: Invitation }) {
  const owner = invitation.owner.displayName ?? "Someone";
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-fg-primary">"{invitation.container.name}"</span>
      <span className="text-small text-fg-secondary">
        A {invitation.container.kind} from {owner} ·{" "}
        {dateFormat.format(new Date(invitation.invitedAt))}
      </span>
    </span>
  );
}

/** Accept and Decline, and what came of them; either way, the pending count is read again. */
function Answers({
  invitation,
  onAnswered,
}: {
  invitation: Invitation;
  onAnswered: (accepted: boolean) => void;
}) {
  const offline = useConnection() === "offline";
  const { run, busy, error } = useSend();
  const choose = async (accept: boolean) => {
    const reason = await run({
      name: accept ? "share.accept" : "share.decline",
      args: { grantId: invitation.id },
    });
    refreshPendingInvitations();
    if (reason === undefined) onAnswered(accept);
  };
  const name = `"${invitation.container.name}"`;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex gap-2">
        <Button
          disabled={busy || offline}
          aria-label={`Accept ${name}`}
          onClick={() => void choose(true)}
        >
          Accept
        </Button>
        <Button
          variant="secondary"
          disabled={busy || offline}
          aria-label={`Decline ${name}`}
          onClick={() => void choose(false)}
        >
          Decline
        </Button>
      </span>
      {error !== undefined && (
        <span role="alert" className="text-small text-status-danger">
          {error}
        </span>
      )}
    </span>
  );
}

const sharedWithMe = (
  <Link to="/shared" className="text-fg-primary underline underline-offset-2">
    Shared with me
  </Link>
);

/** `/invitations` (DS-66): the pending invitations, oldest first. */
export function InvitationsView() {
  const [invitations, setInvitations] = useState<Invitation[]>();
  const [accepted, setAccepted] = useState<string>();
  const read = useCallback(
    (isCurrent: () => boolean = () => true) =>
      api.v1.invitations.get().then(
        ({ data }) => {
          if (isCurrent() && data) setInvitations(data.invitations);
          return data;
        },
        () => undefined,
      ),
    [],
  );
  useEffect(() => {
    let current = true;
    void read(() => current);
    return () => {
      current = false;
    };
  }, [read]);
  return (
    <>
      <PageHeader title="Invitations" path={[toCollection]} />
      <div className="flex flex-col gap-4 p-6">
        {accepted !== undefined && (
          <output className="block text-fg-secondary">
            Accepted "{accepted}". It's in {sharedWithMe}.
          </output>
        )}
        {invitations?.length === 0 && (
          <p className="text-fg-secondary">No invitations are waiting for you.</p>
        )}
        {invitations && invitations.length > 0 && (
          <ul aria-label="Pending invitations" className="flex max-w-2xl flex-col gap-3">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-4 rounded-md bg-panel p-3">
                <span className="min-w-0 flex-1">
                  <Summary invitation={invitation} />
                </span>
                <Answers
                  invitation={invitation}
                  onAnswered={(yes) => {
                    if (yes) setAccepted(invitation.container.name);
                    void read();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** `/invitations/{id}` (DS-66): where an invitation's email lands, signed in. */
export function InvitationView({ id }: { id: string }) {
  const [state, setState] = useState<InvitationState>();
  const [answered, setAnswered] = useState<"accepted" | "declined">();
  useEffect(() => {
    let current = true;
    api.v1
      .invitations({ id })
      .get()
      .then(
        ({ data }) => {
          if (current) setState(data ?? { state: "unavailable" });
          return data;
        },
        () => {
          if (current) setState({ state: "unavailable" });
        },
      );
    return () => {
      current = false;
    };
  }, [id]);
  return (
    <>
      <PageHeader title="Invitation" path={[toCollection]} />
      <div className="flex max-w-2xl flex-col gap-4 p-6">
        {state?.state === "wrong_account" && (
          <p className="text-fg-primary">
            This invitation is for a different account — sign out and sign in with that email.
          </p>
        )}
        {(state?.state === "unavailable" || answered === "declined") && (
          <p className="text-fg-primary">
            {answered === "declined"
              ? "Declined. Nothing was shared with you."
              : "This invitation is no longer available."}
          </p>
        )}
        {(state?.state === "accepted" || answered === "accepted") && (
          <output className="block text-fg-primary">
            You accepted this invitation. It's in {sharedWithMe}.
          </output>
        )}
        {state?.state === "pending" && answered === undefined && (
          <div className="flex items-center gap-4 rounded-md bg-panel p-3">
            <span className="min-w-0 flex-1">
              <Summary invitation={state.invitation} />
            </span>
            <Answers
              invitation={state.invitation}
              onAnswered={(yes) => setAnswered(yes ? "accepted" : "declined")}
            />
          </div>
        )}
      </div>
    </>
  );
}
