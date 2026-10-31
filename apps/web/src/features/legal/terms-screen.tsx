// The one-time agreement screen (TON-131): shown instead of the workspace to a member who hasn't agreed to the current
// terms and privacy notice, such as everyone who joined before they existed, or after a new `termsVersion`. Agreeing
// records it and opens the collection; signing out leaves, removing this browser's copy as the account menu does.

import { api, refusalOf } from "@/api";
import { indexedDbPersistence } from "@/client/sync/persistence";
import { authFailureMessage, signOut } from "@/features/account/auth-client";
import { forgetSignIn } from "@/features/account/pending-sign-in";
import { forgetAccount } from "@/features/account/session";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { termsVersion, type Account } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";

const linkClass = "text-accent-solid underline underline-offset-4";

export function TermsScreen({ account }: { account: Account }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function agree() {
    setBusy(true);
    setError(undefined);
    try {
      const { error: refused } = await api.v1.me.terms.post({ version: termsVersion });
      const reason = refusalOf(refused, "Couldn't save your agreement. Try again.");
      if (reason) {
        setError(reason);
        return;
      }
      forgetAccount();
      await router.invalidate();
    } catch {
      setError("Couldn't reach Tonaris. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setError(undefined);
    const result = await signOut();
    if (!result.ok) {
      setBusy(false);
      setError(authFailureMessage(result));
      return;
    }
    await indexedDbPersistence(account.id).clear();
    forgetAccount();
    forgetSignIn();
    await router.navigate({ to: "/sign-in" });
  }

  return (
    <SignInCard>
      <h1 id={signInTitleId} className="text-title text-fg-primary">
        Tonaris has terms and a privacy notice
      </h1>
      <p className="text-fg-secondary">
        They say what you agree to when you use Tonaris, what it keeps about you, and that it uses
        YouTube API Services to identify YouTube Music links. Read the{" "}
        <Link to="/terms" target="_blank" className={linkClass}>
          Terms of use
        </Link>{" "}
        and the{" "}
        <Link to="/privacy" target="_blank" className={linkClass}>
          Privacy notice
        </Link>
        .
      </p>
      {error && (
        <p role="alert" className="text-status-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void agree()}>
          Agree and continue
        </Button>
        <Button size="lg" disabled={busy} onClick={() => void leave()}>
          Sign out
        </Button>
      </div>
    </SignInCard>
  );
}
