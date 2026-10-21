// `/approvals/$id` (DS-87, TS-64): an AI client asked for a gated operation, and its owner approves or declines
// the exact scope here, on desktop or mobile (FR-10.6, X-04). Server-rendered for a fast first paint (TS-03);
// the request loads in the browser with the session cookie. Tonaris checks the decision itself, so the agent
// can't claim it.

import { api } from "@/api";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import type { Approval } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";

export const Route = createFileRoute("/approvals/$id")({
  head: () => ({ meta: [{ title: "Approve a request · Tonaris" }] }),
  component: ApprovalPage,
});

type Load =
  | { kind: "loading" }
  | { kind: "loaded"; approval: Approval }
  | { kind: "other-account" }
  | { kind: "missing" }
  | { kind: "unreachable" };

/** "9:42": minutes and seconds left. */
function remaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ApprovalPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function fetchApproval() {
      const { data, status } = await api.v1.approvals({ id }).get();
      if (cancelled) return;
      if (data) setLoad({ kind: "loaded", approval: data });
      else if (status === 401) {
        await navigate({ to: "/sign-in", search: { redirect: `/approvals/${id}` } });
      } else if (status === 403) setLoad({ kind: "other-account" });
      else if (status === 404 || status === 422) setLoad({ kind: "missing" });
      else setLoad({ kind: "unreachable" });
    }
    fetchApproval().catch(() => !cancelled && setLoad({ kind: "unreachable" }));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, navigate]);

  async function decide(decision: "approve" | "decline") {
    setBusy(true);
    setError(undefined);
    const { data, status } = await api.v1.approvals({ id }).decision.post({ decision });
    setBusy(false);
    if (data) setLoad({ kind: "loaded", approval: data });
    else if (status === 410 && load.kind === "loaded") {
      setLoad({ kind: "loaded", approval: { ...load.approval, state: "expired" } });
    } else setError("Couldn't record your decision. Try again.");
  }

  if (load.kind !== "loaded") {
    const message = {
      loading: "Loading the request…",
      "other-account": "This request belongs to another account.",
      missing: "There is no such request. It may have been removed with its connection.",
      unreachable: "Couldn't reach Tonaris. Check your connection and try again.",
    }[load.kind];
    return (
      <SignInCard>
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          Approval request
        </h1>
        <p role={load.kind === "loading" ? "status" : "alert"} className="text-fg-secondary">
          {message}
        </p>
      </SignInCard>
    );
  }

  const { approval } = load;
  const client = approval.clientName ?? "an AI client";
  const left = new Date(approval.expiresAt).getTime() - now;
  const state = approval.state === "pending" && left <= 0 ? "expired" : approval.state;
  const outcome = {
    pending: undefined,
    approved: `Approved — return to ${client} to continue.`,
    used: `Approved, and ${client} has done it.`,
    declined: "Declined. Nothing will change.",
    expired: `This request expired, and nothing happened. Ask ${client} again if you still want it.`,
  }[state];

  return (
    <SignInCard>
      <div className="flex flex-col gap-1">
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          Approve request from {client}
        </h1>
        <p className="text-fg-primary">{approval.summary}</p>
      </div>

      <details className="rounded-lg border border-subtle bg-raised p-3">
        <summary className="cursor-pointer text-fg-primary">
          {approval.scope.albums.length === 1
            ? "1 album"
            : `${approval.scope.albums.length} albums`}
        </summary>
        <ul className="mt-2 flex flex-col gap-2">
          {approval.scope.albums.map((album) => (
            <li key={album.id} className="flex flex-col">
              <span className="text-fg-primary">
                {album.title} · {album.artist}
              </span>
              <span className="text-small text-fg-secondary">
                {album.lists.length === 0
                  ? "In Unsorted"
                  : `Leaves ${album.lists.map((list) => list.name).join(", ")}`}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-secondary">
        {approval.consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {outcome ? (
        <output className="block text-fg-primary">{outcome}</output>
      ) : (
        <>
          <p className="text-small text-fg-secondary">Expires in {remaining(left)}</p>
          {error && (
            <p role="alert" className="text-status-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="lg" disabled={busy} onClick={() => void decide("decline")}>
              Decline
            </Button>
            <Button
              size="lg"
              variant="danger"
              disabled={busy}
              onClick={() => void decide("approve")}
            >
              Approve
            </Button>
          </div>
        </>
      )}
    </SignInCard>
  );
}
