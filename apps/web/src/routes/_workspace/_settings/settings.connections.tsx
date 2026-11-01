// Settings → Connections (DS-86, FR-10.1, FR-10.3): the AI clients' requests waiting for approval, how to connect a
// client, and the clients connected through MCP (features/settings/connections.tsx).

import { api } from "@/api";
import { ConnectionsSettings } from "@/features/settings/connections";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_settings/settings/connections")({
  staticData: { title: "Connections" },
  head: () => ({ meta: [{ title: "Connections · Tonaris" }] }),
  loader: async () => {
    const { data, status } = await api.v1.connections.get();
    if (!data) throw new Error(`Couldn't load the connections (HTTP ${status}).`);
    return data;
  },
  component: ConnectionsPage,
});

function ConnectionsPage() {
  return <ConnectionsSettings connections={Route.useLoaderData()} />;
}
