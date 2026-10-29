// Settings → Connections (DS-86, FR-10.3): the AI clients connected through MCP, each with its mode, when it
// connected and last called, and a Revoke action, and the server URL to connect a new one. Pending approvals
// (TON-83) and per-client setup steps (TON-86) join it later in M9.

import { api } from "@/api";
import { apiUrl } from "@/config";
import { SettingsNav } from "@/features/settings/settings-nav";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute, useRouter } from "@tanstack/react-router";
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
        <section aria-labelledby="server-url" className="flex flex-col gap-1.5">
          <h2 id="server-url" className="text-title text-fg-primary">
            MCP server URL
          </h2>
          <p className="text-fg-secondary">
            Add it as a custom connector in Claude, ChatGPT or Codex, then sign in and choose what
            the client may do.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-subtle bg-raised px-2.5 py-1.5 text-fg-primary">
              {serverUrl}
            </code>
            <Button onClick={() => void navigator.clipboard.writeText(serverUrl)}>Copy</Button>
          </div>
        </section>

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
