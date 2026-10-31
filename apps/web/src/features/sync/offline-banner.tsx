// The slim banner over the main view while the workspace is offline (DS-81, PRD section 2.3): what is shown was
// loaded before, and isn't promised to be current.

import { CloudOff } from "lucide-react";

import { useConnection } from "./sync-provider";

export function OfflineBanner() {
  const connection = useConnection();
  if (connection !== "offline") return null;
  return (
    <div
      data-slot="offline-banner"
      data-page-chrome
      className="flex h-8 shrink-0 items-center gap-2 border-b border-subtle bg-raised px-6 text-small text-fg-secondary"
    >
      <CloudOff strokeWidth={1.5} className="size-3.5 text-status-danger" aria-hidden />
      Offline — showing what was last loaded
    </div>
  );
}
