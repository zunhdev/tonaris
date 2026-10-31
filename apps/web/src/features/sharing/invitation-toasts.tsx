// New invitations announced in the open app (TON-129; FR-07.5, DS-66): a notice that "{owner} shared "{name}" with
// you", with View opening the invitation, or "{n} new invitations" with View opening Invitations when several arrive
// together. They are noticed as the sidebar's Invitations is: on load, on focus and every minute. Each is announced once
// on the device, those found on load included; on the Invitations pages, they're already in view.

import { announcedInvitations } from "@/features/shell/device";
import { useNotify } from "@/features/sync/notify";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { usePendingInvitationList } from "./pending-invitations";

export function InvitationToasts({ accountId }: { accountId: string }) {
  const invitations = usePendingInvitationList();
  const notify = useNotify();
  const navigate = useNavigate();
  const onInvitations = useLocation({
    select: (location) => location.pathname.startsWith("/invitations"),
  });
  useEffect(() => {
    if (!invitations || !notify) return;
    const announced = announcedInvitations.read(accountId);
    const fresh = invitations.filter((invitation) => !announced.has(invitation.id));
    // Only the pending ones are kept, so the record stays short.
    announcedInvitations.write(
      accountId,
      invitations.map((invitation) => invitation.id),
    );
    const [first] = fresh;
    if (!first || onInvitations) return;
    if (fresh.length === 1) {
      const owner = first.owner.displayName ?? "A Tonaris member";
      notify.notice(`${owner} shared "${first.container.name}" with you`, {
        label: "View",
        onClick: () => void navigate({ to: "/invitations/$id", params: { id: first.id } }),
      });
    } else {
      notify.notice(`${fresh.length} new invitations`, {
        label: "View",
        onClick: () => void navigate({ to: "/invitations" }),
      });
    }
  }, [invitations, notify, accountId, navigate, onInvitations]);
  return null;
}
