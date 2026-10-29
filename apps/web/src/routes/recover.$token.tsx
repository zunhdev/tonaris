// `/recover/:token` (FR-11.5, TS-73): where the creator's recovery email links, with its code in the fragment. The
// page asks for a click before confirming, so a mail scanner that opens the link changes nothing. Confirming moves
// the account to this address and signs it out everywhere; the person then signs in with it. Client-rendered,
// since the code is in the fragment; the URL carries the token, so the page sends no Referer (security/headers.ts).

import { authFailureMessage, confirmRecovery } from "@/features/account/auth-client";
import { CodeField } from "@/features/account/code-field";
import { forgetAccount } from "@/features/account/session";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { signInCode } from "@tonaris/domain";
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
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const codeInput = useRef<HTMLInputElement>(null);

  // The link's code fills the field, and leaves the URL.
  useEffect(() => {
    const linkCode = new URLSearchParams(window.location.hash.slice(1)).get("code");
    if (!linkCode) return;
    setCode(linkCode.replaceAll(/\D/g, "").slice(0, signInCode.length));
    void navigate({ to: "/recover/$token", params: { token }, replace: true });
    // Read once, on arrival.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== signInCode.length) {
      setError(`Enter the ${signInCode.length}-digit code from the email.`);
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await confirmRecovery(token, code);
    setBusy(false);
    if (result.ok) {
      // Any session in this browser ended with the swap.
      forgetAccount();
      setDone(result.email);
      return;
    }
    setError(authFailureMessage(result));
    codeInput.current?.focus();
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
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <CodeField
          value={code}
          onChange={setCode}
          hint="Confirming moves your Tonaris account to the address this email came to, and signs it out everywhere."
          error={error}
          inputRef={codeInput}
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Confirm
        </Button>
      </form>
    </SignInCard>
  );
}
