// The AI clients' setup steps on Help's Connect page (FR-16.1, TS-136): the very guide Settings → Connections shows
// (features/connections/setup-guide.tsx), with this server's address, so the two can't tell different stories.

import { apiUrl } from "@/config";
import { SetupGuide } from "@/features/connections/setup-guide";

export function ConnectGuide() {
  return (
    <div className="rounded-xl border border-subtle bg-panel p-5">
      <SetupGuide serverUrl={`${apiUrl}/mcp`} />
    </div>
  );
}
