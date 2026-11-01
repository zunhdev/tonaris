// `/recover/:token` (FR-11.5, TS-73): where the creator's recovery email links, with its code in the fragment. The
// page asks for a click before confirming, so a mail scanner that opens the link changes nothing: the code fills the
// field, and six typed digits wait for Confirm too. Confirming moves the account to this address and signs it out
// everywhere; the person then signs in with it. Client-rendered, since the code is in the fragment; the URL carries
// the token, so the page sends no Referer (security/headers.ts).

import { authFailureMessage, confirmRecovery } from "@/features/account/auth-client";
import { useCodeEntry } from "@/features/account/code-entry";
import { CodeField, codeDigits } from "@/features/account/code-field";
import { forgetAccount } from "@/features/account/session";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@tonaris/ui/components/button";

export const Route = createFileRoute("/recover/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirm your new sign-in email · Tonaris" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmRecovery,
});

function ConfirmRecovery() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [done, setDone] = useState<string>();
  const entry = useCodeEntry({ submit: (value) => void submit(value), autoSubmit: false });

  // The link's code fills the field, and leaves the URL.
  useEffect(() => {
    const linkCode = new URLSearchParams(window.location.hash.slice(1)).get("code");
    if (!linkCode) return;
    entry.setCode(codeDigits(linkCode));
    void navigate({ to: "/recover/$token", params: { token }, replace: true });
    // Read once, on arrival.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(value: string) {
    entry.begin();
    const result = await confirmRecovery(token, value);
    entry.setBusy(false);
    if (result.ok) {
      // Any session in this browser ended with the swap.
      forgetAccount();
      setDone(result.email);
      return;
    }
    // Unlike sign-in's, the field keeps the code.
    entry.setError(authFailureMessage(result));
    entry.codeInput.current?.focus();
  }

  if (done) {
    return (
      <SignInCard>
        <h1 id={signInTitleId} className="text-title [overflow-wrap:anywhere] text-fg-primary">
          Done — use {done} to sign in.
        </h1>
        <p className="text-fg-secondary">Your old address doesn't sign in any more.</p>
        <Link to="/sign-in" className="text-accent-solid underline-offset-4 hover:underline">
          Sign in
        </Link>
      </SignInCard>
    );
  }

  return (
    <SignInCard>
      <h1 id={signInTitleId} className="text-title text-fg-primary">
        Confirm your new sign-in email
      </h1>
      <form className="flex flex-col gap-3" onSubmit={entry.onSubmit}>
        <CodeField
          value={entry.code}
          onChange={entry.onCodeChange}
          hint="Confirming moves your Tonaris account to the address this email came to, and signs it out everywhere."
          error={entry.error}
          inputRef={entry.codeInput}
        />
        <Button type="submit" variant="primary" size="lg" disabled={entry.busy}>
          Confirm
        </Button>
      </form>
    </SignInCard>
  );
}
