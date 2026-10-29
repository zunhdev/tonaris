// `/approvals/$id` (DS-87, TS-64): an AI client asked for a gated operation, and its owner approves or declines
// the exact scope here, on desktop or mobile (FR-10.6, X-04). Server-rendered for a fast first paint (TS-03);
// the request loads in the browser with the session cookie. Tonaris checks the decision itself, so the agent
// can't claim it.

import { api } from "@/api";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { refreshPendingApprovals } from "@/features/connections/pending-approvals";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { Approval, ApprovalScope } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

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

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const fieldTypeNames: Record<NonNullable<ApprovalScope["field"]>["type"], string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  yes_no: "Yes/no",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
};

/** "12 albums, 2 in Trash". */
const albumsAffected = ({ albums, inTrash }: { albums: number; inTrash: number }) =>
  `${count(albums + inTrash, "album", "albums")}${inTrash > 0 ? `, ${inTrash} in Trash` : ""}`;

/**
 * One expandable part of the scope (DS-87): a button that says whether it's expanded, which every browser and screen
 * reader announces alike, unlike a `<summary>`, which Safari exposes without a role (TON-93).
 */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-lg border border-subtle bg-raised p-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center gap-1.5 rounded-sm text-left text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
      >
        <ChevronRight
          aria-hidden
          strokeWidth={1.5}
          className={cn(
            "size-4 shrink-0 text-fg-tertiary motion-safe:transition-transform",
            open && "rotate-90",
          )}
        />
        {title}
      </button>
      <ul id={id} hidden={!open} className="mt-2 flex flex-col gap-2">
        {children}
      </ul>
    </div>
  );
}

function Row({ name, detail }: { name: string; detail?: string }) {
  return (
    <li className="flex flex-col">
      <span className="text-fg-primary">{name}</span>
      {detail && <span className="text-small text-fg-secondary">{detail}</span>}
    </li>
  );
}

/** The exact scope, in Tonaris's words: what goes, what's affected, and who no longer sees it (DS-87, FR-07.14). */
function ScopeDetails({ scope }: { scope: ApprovalScope }) {
  const containers = scope.containers ?? [];
  const sharing = scope.sharing ?? [];
  return (
    <div className="flex flex-col gap-2">
      {scope.match && (
        <Part title={`"${scope.match.title}"`}>
          <Row name="The link" detail={scope.match.link} />
          {scope.match.listName && <Row name="Goes in" detail={scope.match.listName} />}
        </Part>
      )}
      {containers.length > 0 && (
        <Part
          title={[
            count(containers.filter((c) => c.kind === "folder").length, "folder", "folders"),
            count(containers.filter((c) => c.kind === "list").length, "list", "lists"),
          ]
            .filter((part) => !part.startsWith("0 "))
            .join(", ")}
        >
          {containers.map((container) => (
            <Row
              key={container.id}
              name={container.name}
              detail={
                container.kind === "list"
                  ? "List"
                  : container.folders + container.lists === 0
                    ? "Folder, empty"
                    : `Folder with ${[
                        container.lists > 0 && count(container.lists, "list", "lists"),
                        container.folders > 0 && count(container.folders, "folder", "folders"),
                      ]
                        .filter(Boolean)
                        .join(" and ")}`
              }
            />
          ))}
        </Part>
      )}
      {scope.albums.length > 0 && (
        <Part title={count(scope.albums.length, "album", "albums")}>
          {scope.albums.map((album) => (
            <Row
              key={album.id}
              name={`${album.title} · ${album.artist}`}
              detail={
                scope.operation === "confirm_match"
                  ? "In your collection"
                  : album.lists.length === 0
                    ? "In Unsorted"
                    : `Leaves ${album.lists.map((list) => list.name).join(", ")}`
              }
            />
          ))}
        </Part>
      )}
      {scope.field && (
        <Part title={`The field "${scope.field.name}"`}>
          <Row
            name={fieldTypeNames[scope.field.type]}
            detail={`On ${albumsAffected(scope.field)}`}
          />
          {(scope.options ?? []).map((option) => (
            <Row
              key={option.id}
              name={`Option "${option.label}"`}
              detail={`Chosen on ${albumsAffected(option)}`}
            />
          ))}
        </Part>
      )}
      {sharing.length > 0 && (
        <Part title="Who no longer sees it">
          {sharing.map((audience) => (
            <Row
              key={audience.kind === "person" ? audience.id : audience.via.id}
              name={
                audience.kind === "person"
                  ? `${audience.name}${audience.pending ? " (invited)" : ""}`
                  : "Anyone with the link"
              }
              detail={`Through "${audience.via.name}"`}
            />
          ))}
        </Part>
      )}
    </div>
  );
}

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
    refreshPendingApprovals();
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

      <ScopeDetails scope={approval.scope} />

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
              variant={approval.scope.operation === "confirm_match" ? "primary" : "danger"}
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
