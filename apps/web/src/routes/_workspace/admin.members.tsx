// Admin → Members (DS-100, FR-11.5, FR-11.6): every account with its email, display name and join date, and never
// its collection. Recover sign-in email, on a row, sends a code and link to a new address the person gave the
// creator; the row waits until the new address confirms it, or the creator cancels. The creator judges ownership
// outside the app (TS-73).

import { api, refusalOf } from "@/api";
import { AdminNav } from "@/features/admin/admin-nav";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useRef, useState } from "react";

import { maxRecoveryReasonLength, type Member } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

export const Route = createFileRoute("/_workspace/admin/members")({
  head: () => ({ meta: [{ title: "Members · Tonaris" }] }),
  beforeLoad: ({ context }) => {
    if (context.account.role !== "creator") throw notFound();
  },
  loader: async () => {
    const { data, status } = await api.v1.admin.members.get();
    if (!data) throw new Error(`Couldn't load the members (HTTP ${status}).`);
    return data.members;
  },
  component: MembersPage,
});

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function MembersPage() {
  const members = Route.useLoaderData();
  const router = useRouter();
  const id = useId();
  const [recovering, setRecovering] = useState<Member>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function cancel(member: Member) {
    setBusy(member.id);
    setError(undefined);
    const { error: failed } = await api.v1.admin.members({ id: member.id }).recovery.delete();
    setBusy(undefined);
    setError(refusalOf(failed, "Couldn't cancel the recovery. Try again."));
    await router.invalidate();
  }

  return (
    <>
      <PageHeader title="Members" />
      <AdminNav />
      <div className="flex max-w-5xl flex-col gap-3 p-6">
        <p className="text-fg-secondary">
          Recover a sign-in email only once you're sure the account is theirs. The new address
          confirms it before anything changes, and the reason goes in the audit log.
        </p>
        {error && (
          <p role="alert" className="text-small text-status-danger">
            {error}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table aria-labelledby={`${id}-title`} className="w-full min-w-[44rem] text-left">
            <caption id={`${id}-title`} className="sr-only">
              Members
            </caption>
            <thead className="text-small text-fg-secondary">
              <tr className="border-b border-subtle">
                <th scope="col" className="px-3 py-2 font-normal">
                  Email
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Display name
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Joined
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Recovery
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="max-w-64 truncate px-3 py-2 text-fg-primary">{member.email}</td>
                  <td className="max-w-48 truncate px-3 py-2 text-fg-primary">
                    {member.displayName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">
                    {date.format(new Date(member.joinedAt))}
                  </td>
                  <td className="max-w-64 truncate px-3 py-2 text-fg-secondary">
                    {member.recovery
                      ? `Waiting for verification · ${member.recovery.newEmail}`
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">
                      {member.recovery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === member.id}
                          aria-label={`Cancel recovery for ${member.email}`}
                          onClick={() => void cancel(member)}
                        >
                          Cancel recovery
                        </Button>
                      )}
                      <Button
                        size="sm"
                        aria-label={`Recover sign-in email for ${member.email}`}
                        onClick={() => setRecovering(member)}
                      >
                        Recover sign-in email
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {recovering && (
        <RecoverDialog
          member={recovering}
          onClose={() => setRecovering(undefined)}
          onSent={() => {
            setRecovering(undefined);
            void router.invalidate();
          }}
        />
      )}
    </>
  );
}

/** The recovery's form (DS-100): the new address, the reason, and whether AI connections end too. */
function RecoverDialog({
  member,
  onClose,
  onSent,
}: {
  member: Member;
  onClose: () => void;
  onSent: () => void;
}) {
  const id = useId();
  const newEmailRef = useRef<HTMLInputElement>(null);
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState("");
  const [disconnectConnections, setDisconnectConnections] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error: failed } = await api.v1.admin
      .members({ id: member.id })
      .recovery.post({ newEmail, reason, disconnectConnections });
    setBusy(false);
    const refusal = refusalOf(failed, "Couldn't start the recovery. Try again.");
    if (refusal) setError(refusal);
    else onSent();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[480px]" initialFocus={newEmailRef}>
        <DialogHeader>
          <DialogTitle>Recover sign-in email</DialogTitle>
          <DialogDescription>
            {member.email} can't sign in. Tonaris emails a code and link to the new address, and the
            account moves there once it's confirmed. Their sessions end then.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-new`}>New email address</Label>
            <Input
              ref={newEmailRef}
              id={`${id}-new`}
              type="email"
              required
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-reason`}>Reason</Label>
            <textarea
              id={`${id}-reason`}
              rows={3}
              required
              maxLength={maxRecoveryReasonLength}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`${id}-reason-hint`}
              className="rounded-md border border-strong bg-app px-2.5 py-1.5 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
            />
            <p id={`${id}-reason-hint`} className="text-small text-fg-tertiary">
              How you confirmed it's theirs. It goes in the audit log.
            </p>
          </div>
          <label className="flex items-center gap-2 text-fg-primary">
            <input
              type="checkbox"
              checked={disconnectConnections}
              onChange={(event) => setDisconnectConnections(event.target.checked)}
              className="accent-accent-fill"
            />
            Also disconnect AI connections
          </label>
          {error && (
            <p role="alert" className="text-small text-status-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              Send verification
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
