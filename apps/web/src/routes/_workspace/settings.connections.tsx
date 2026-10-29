// Settings → Connections (DS-86, FR-10.1, FR-10.3): the AI clients' requests waiting for approval; how to connect
// Claude, ChatGPT or Codex, with the server URL; and the clients connected through MCP, each with its mode, when it
// connected and last called, and a Revoke action.

import { api } from "@/api";
import { apiUrl } from "@/config";
import { usePendingApprovals } from "@/features/connections/pending-approvals";
import { SetupGuide } from "@/features/connections/setup-guide";
import { SettingsNav } from "@/features/settings/settings-nav";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import type { Connection } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";

export const Route = createFileRoute("/_workspace/settings/connections")({
  head: () => ({ meta: [{ title: "Connections · Tonaris" }] }),
  loader: async () => {
    const { data, status } = await api.v1.connections.get();
    if (!data) throw new Error(`Couldn't load the connections (HTTP ${status}).`);
    return data;
  },
  component: Connections,
});

const modeNames: Record<NonNullable<Connection["mode"]>, string> = {
  read_only: "Read-only",
  manage: "Manage collection",
};

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "Manage collection · Connected 29 Oct 2026 · Last used 29 Oct 2026, 16:02" (DS-86). */
function connectionDetails(connection: Connection): string {
  return [
    connection.mode ? modeNames[connection.mode] : "No access",
    `Connected ${date.format(new Date(connection.connectedAt))}`,
    connection.lastUsedAt
      ? `Last used ${dateTime.format(new Date(connection.lastUsedAt))}`
      : "Not used yet",
  ].join(" · ");
}

/** "Expires in 12 min", to the minute. */
function expiresIn(expiresAt: string, now: number): string {
  const minutes = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
  return `Expires in ${minutes} min`;
}

/** The requests waiting for the person's approval, each linking to its page (DS-86, DS-87). */
function WaitingForApproval() {
  const pending = usePendingApprovals();
  // The time the list was shown; the store reads the requests again every 30 seconds.
  const [now] = useState(() => Date.now());
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="waiting" className="flex flex-col gap-2">
      <h2 id="waiting" className="text-title text-fg-primary">
        Waiting for your approval ({pending.length})
      </h2>
      <ul className="flex flex-col divide-y divide-subtle rounded-lg border border-subtle">
        {pending.map((approval) => (
          <li key={approval.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-fg-primary">{approval.summary}</span>
              <span className="text-small text-fg-secondary">
                {approval.clientName ?? "An AI client"} · {expiresIn(approval.expiresAt, now)}
              </span>
            </div>
            <Link
              to="/approvals/$id"
              params={{ id: approval.id }}
              className="text-accent-solid underline-offset-4 hover:underline"
            >
              Review
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Connections() {
  const connections = Route.useLoaderData();
  const router = useRouter();
  const [revoking, setRevoking] = useState<string>();
  const [error, setError] = useState<string>();
  const serverUrl = `${apiUrl}/mcp`;

  async function revoke(connection: Connection) {
    setRevoking(connection.id);
    setError(undefined);
    const { error: failed } = await api.v1.connections({ id: connection.id }).delete();
    setRevoking(undefined);
    if (failed && failed.status !== 404) {
      setError("Couldn't revoke the connection. Try again.");
      return;
    }
    await router.invalidate();
  }

  return (
    <>
      <PageHeader title="Connections" />
      <SettingsNav />
      <div className="flex max-w-2xl flex-col gap-6 p-6">
        <WaitingForApproval />
        <SetupGuide serverUrl={serverUrl} />

        <section aria-labelledby="connected" className="flex flex-col gap-2">
          <h2 id="connected" className="text-title text-fg-primary">
            Connected clients
          </h2>
          <p className="text-fg-secondary">
            To change what a client may do, revoke it and connect it again.
          </p>
          {error && (
            <p role="alert" className="text-status-danger">
              {error}
            </p>
          )}
          {connections.length === 0 ? (
            <p className="text-fg-secondary">No AI client is connected.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-subtle rounded-lg border border-subtle">
              {connections.map((connection) => (
                <li key={connection.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-fg-primary">
                      {connection.clientName ?? connection.clientId}
                    </span>
                    <span className="text-small text-fg-secondary">
                      {connectionDetails(connection)}
                    </span>
                  </div>
                  <Button
                    variant="danger"
                    disabled={revoking === connection.id}
                    onClick={() => void revoke(connection)}
                    aria-label={`Revoke ${connection.clientName ?? connection.clientId}`}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
