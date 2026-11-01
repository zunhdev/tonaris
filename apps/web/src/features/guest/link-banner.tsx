// A signed-in visit to a shared link (DS-68, FR-07.13): a banner offers to keep the collection in Shared with me, and
// says when it's there. Opening the link adds nothing; only the button does. Asked in the browser, after the server
// rendered the public page: a guest, or the owner, sees no banner.

import { api } from "@/api";
import { useSend } from "@/features/sharing/send";
import { useKeyedRead } from "@/features/shell/use-keyed-read";
import { useState } from "react";

import { Button } from "@tonaris/ui/components/button";

export function LinkBanner({ token, owner }: { token: string; owner: string }) {
  const [added, setAdded] = useState(false);
  const { run, busy, error } = useSend();
  const asked = useKeyedRead(token, () =>
    api.v1
      .s({ token })
      .reference.get()
      .then(({ data }) =>
        data && !data.own ? (data.saved ? ("saved" as const) : ("offer" as const)) : undefined,
      ),
  );
  const state = added ? "saved" : (asked?.value ?? "hidden");
  if (state === "hidden") return null;
  const add = async () => {
    if ((await run({ name: "share.saveLink", args: { token } })) === undefined) setAdded(true);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-subtle bg-panel px-6 py-2 text-small">
      <span className="text-fg-secondary">Shared by {owner}</span>
      {state === "saved" ? (
        <a href="/shared" className="text-fg-primary underline underline-offset-2">
          In Shared with me
        </a>
      ) : (
        <Button size="sm" disabled={busy} onClick={() => void add()}>
          Add to Shared with me
        </Button>
      )}
      {error !== undefined && (
        <span role="alert" className="text-status-danger">
          {error}
        </span>
      )}
    </div>
  );
}
