// A signed-in visit to a shared link (DS-68, FR-07.13): a banner offers to keep the collection in Shared with me, and
// says when it's there. Opening the link adds nothing; only the button does. Asked in the browser, after the server
// rendered the public page: a guest, or the owner, sees no banner.

import { api } from "@/api";
import { failureOf, sendNow } from "@/features/sharing/send";
import { useEffect, useState } from "react";

import { Button } from "@tonaris/ui/components/button";

export function LinkBanner({ token, owner }: { token: string; owner: string }) {
  const [state, setState] = useState<"hidden" | "offer" | "saved">("hidden");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    api.v1
      .s({ token })
      .reference.get()
      .then(
        ({ data }) => {
          if (current && data && !data.own) setState(data.saved ? "saved" : "offer");
          return data;
        },
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [token]);
  if (state === "hidden") return null;
  const add = async () => {
    setBusy(true);
    try {
      const reason = failureOf(await sendNow({ name: "share.saveLink", args: { token } }));
      setError(reason);
      if (reason === undefined) setState("saved");
    } catch {
      setError("Couldn't reach Tonaris. Try again.");
    } finally {
      setBusy(false);
    }
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
