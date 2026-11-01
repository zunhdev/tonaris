// `/account-deleted` (DS-97, TS-74): where deleting the account lands, outside the workspace, since the session is
// gone. With the tab's deletion token, it follows the job: "Deleting your account…", then "Your account has been
// deleted"; a failure says so, with Retry, and claims nothing done. Without a token it only says the account has
// been deleted.

import {
  authFailureMessage,
  deletionProgress,
  retryDeletion,
} from "@/features/account/auth-client";
import { forgetDeletion, pendingDeletion } from "@/features/account/pending-deletion";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@tonaris/ui/components/button";

export const Route = createFileRoute("/account-deleted")({
  ssr: false,
  head: () => ({ meta: [{ title: "Account deleted · Tonaris" }] }),
  component: AccountDeleted,
});

type State = "deleting" | "deleted" | "failed";

function AccountDeleted() {
  const [token] = useState(pendingDeletion);
  const [state, setState] = useState<State>(token ? "deleting" : "deleted");
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  // While it runs, ask every second.
  useEffect(() => {
    if (!token || state !== "deleting") return undefined;
    async function ask(asked: string) {
      const progress = await deletionProgress(asked);
      if (!progress.ok) {
        setNotice(authFailureMessage(progress));
        return;
      }
      setNotice(undefined);
      setState(progress.status);
      if (progress.status === "deleted") forgetDeletion();
    }
    const timer = setInterval(() => void ask(token), 1_000);
    return () => clearInterval(timer);
  }, [token, state]);

  async function retry() {
    if (!token) return;
    setBusy(true);
    const progress = await retryDeletion(token);
    setBusy(false);
    if (progress.ok) setState(progress.status);
    else setNotice(authFailureMessage(progress));
  }

  if (state === "deleted") {
    return (
      <SignInCard home>
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          Your account has been deleted
        </h1>
        <p className="text-fg-secondary">Everything in it is gone. Thanks for using Tonaris.</p>
      </SignInCard>
    );
  }

  return (
    <SignInCard home>
      <h1 id={signInTitleId} className="text-title text-fg-primary" aria-live="polite">
        {state === "deleting" ? "Deleting your account…" : "Couldn't finish deleting your account"}
      </h1>
      {state === "deleting" ? (
        <progress aria-label="Deleting your account" className="w-full accent-accent-fill" />
      ) : (
        <>
          <p className="text-fg-secondary">Try again to finish it.</p>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void retry()}>
            Retry
          </Button>
        </>
      )}
      <output className="text-fg-secondary empty:hidden">{notice}</output>
    </SignInCard>
  );
}
