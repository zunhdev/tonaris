// Admin → Admissions (DS-100, FR-11.6): the creator's switch for accepting new members, inviting by email, and
// every invitation with its status, dates and email delivery, apart, with Resend and Revoke. A desktop page for
// the creator only; anyone else finds no page here.

import { api, refusalOf } from "@/api";
import { AdminNav } from "@/features/admin/admin-nav";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useId, useState } from "react";

import {
  type AdmissionInvitation,
  type AdmissionInvitationStatus,
  type Admissions,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { Switch } from "@tonaris/ui/components/switch";

export const Route = createFileRoute("/_workspace/admin/admissions")({
  head: () => ({ meta: [{ title: "Admissions · Tonaris" }] }),
  beforeLoad: ({ context }) => {
    if (context.account.role !== "creator") throw notFound();
  },
  loader: async () => {
    const { data, status } = await api.v1.admin.admissions.get();
    if (!data) throw new Error(`Couldn't load admissions (HTTP ${status}).`);
    return data;
  },
  component: AdmissionsPage,
});

const statusNames: Record<AdmissionInvitationStatus, string> = {
  available: "Available",
  redeemed: "Redeemed",
  revoked: "Revoked",
  expired: "Expired",
};

const deliveryNames: Record<NonNullable<AdmissionInvitation["emailStatus"]>, string> = {
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
  unknown: "Not confirmed",
};

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function AdmissionsPage() {
  const admissions = Route.useLoaderData();
  const router = useRouter();
  const sending = admissions.invitations.some((invitation) => invitation.emailStatus === "sending");

  // While an email is on its way, its outcome shows up without a refresh.
  useEffect(() => {
    if (!sending) return undefined;
    const timer = setInterval(() => void router.invalidate(), 2_000);
    return () => clearInterval(timer);
  }, [sending, router]);

  const reload = () => void router.invalidate();
  return (
    <>
      <PageHeader title="Admissions" />
      <AdminNav />
      <div className="flex max-w-5xl flex-col gap-6 p-6">
        <Accepting paused={admissions.paused} onChanged={reload} />
        <InviteForm onInvited={reload} />
        <Invitations invitations={admissions.invitations} onChanged={reload} />
      </div>
    </>
  );
}

/** The header switch (DS-100): on accepts new members; off pauses admissions, with its note. */
function Accepting({ paused, onChanged }: { paused: boolean; onChanged: () => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function turn(accepting: boolean) {
    setBusy(true);
    setError(undefined);
    const { error: failed } = await api.v1.admin.admissions.paused.put({ paused: !accepting });
    setBusy(false);
    setError(refusalOf(failed, "Couldn't change admissions. Try again."));
    onChanged();
  }
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle p-3">
        <div className="flex flex-col">
          <span id={`${id}-title`} className="text-base font-medium text-fg-primary">
            Accepting new members
          </span>
          <span id={`${id}-status`} className="text-small text-fg-secondary">
            {paused
              ? "Paused: no one can join until you turn this back on."
              : "On: people you invite can join."}
          </span>
        </div>
        <Switch
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-status`}
          checked={!paused}
          disabled={busy}
          onCheckedChange={(checked) => void turn(checked)}
        />
      </div>
      {paused && (
        <p className="text-small text-fg-secondary">
          Existing members keep access; outstanding invitations stay as they are.
        </p>
      )}
      {error && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/** Invite by email: a refusal keeps the typed address, with the reason under it. */
function InviteForm({ onInvited }: { onInvited: () => void }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() === "") return;
    setBusy(true);
    const { error: failed } = await api.v1.admin.admissions.invitations.post({ email });
    setBusy(false);
    const reason = refusalOf(failed, "Couldn't invite them. Try again.");
    setError(reason);
    if (reason === undefined) {
      setEmail("");
      onInvited();
    }
  }
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-1.5">
      <h2 id={`${id}-title`} className="text-title text-fg-primary">
        Invite
      </h2>
      <p className="text-fg-secondary">
        The invitation works once, only for this address, and expires in 14 days.
      </p>
      <form onSubmit={(event) => void submit(event)} className="flex max-w-lg gap-2">
        <Input
          type="email"
          aria-label="Email address to invite"
          placeholder="anna@example.com"
          value={email}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(undefined);
          }}
        />
        <Button type="submit" disabled={busy}>
          Invite
        </Button>
      </form>
      {error !== undefined && (
        <p id={`${id}-error`} role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/** The invitations table (DS-100): status and email delivery in their own columns (FR-11.6). */
function Invitations({
  invitations,
  onChanged,
}: {
  invitations: Admissions["invitations"];
  onChanged: () => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function act(invitation: AdmissionInvitation, action: "resend" | "revoke") {
    setBusy(invitation.id);
    setError(undefined);
    const one = api.v1.admin.admissions.invitations({ id: invitation.id });
    const { error: failed } =
      action === "resend" ? await one.resend.post({}) : await one.revoke.post({});
    setBusy(undefined);
    setError(
      refusalOf(
        failed,
        action === "resend"
          ? "Couldn't send the invitation again. Try again."
          : "Couldn't revoke the invitation. Try again.",
      ),
    );
    onChanged();
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h2 id={`${id}-title`} className="text-title text-fg-primary">
        Invitations
      </h2>
      {error && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
      {invitations.length === 0 ? (
        <p className="text-fg-secondary">No invitations yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table aria-labelledby={`${id}-title`} className="w-full min-w-[44rem] text-left">
            <thead className="text-small text-fg-secondary">
              <tr className="border-b border-subtle">
                <th scope="col" className="px-3 py-2 font-normal">
                  Email
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Created
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Expires
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Email delivery
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {invitations.map((invitation) => {
                const available = invitation.status === "available";
                const undelivered =
                  invitation.emailStatus === "failed" || invitation.emailStatus === "unknown";
                return (
                  <tr key={invitation.id}>
                    <td className="max-w-64 truncate px-3 py-2 text-fg-primary">
                      {invitation.email}
                    </td>
                    <td className="px-3 py-2 text-fg-primary">{statusNames[invitation.status]}</td>
                    <td className="px-3 py-2 text-fg-secondary">
                      {date.format(new Date(invitation.createdAt))}
                    </td>
                    <td className="px-3 py-2 text-fg-secondary">
                      {date.format(new Date(invitation.expiresAt))}
                    </td>
                    <td className="px-3 py-2 text-fg-secondary">
                      {invitation.emailStatus ? deliveryNames[invitation.emailStatus] : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1">
                        {available && undelivered && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy === invitation.id}
                            aria-label={`Resend the invitation to ${invitation.email}`}
                            onClick={() => void act(invitation, "resend")}
                          >
                            Resend
                          </Button>
                        )}
                        {available && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy === invitation.id}
                            aria-label={`Revoke the invitation to ${invitation.email}`}
                            onClick={() => void act(invitation, "revoke")}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
