// `/sign-in` (DS-90): an email field and **Continue**. Every address gets the same next step, so the page reveals
// nothing about who has an account; the email itself says when there is none. **Sign in with a passkey** under it,
// and the email field's autofill, sign in with a passkey instead (TON-143). "Lost access to your email?" leads
// to `/help/recovery` (DS-93). When the API's authorization server sends someone here to connect an AI client
// (TS-61), signing in continues that request.

import {
  type AuthResult,
  authFailureMessage,
  cancelPasskeyPrompt,
  requestSignInCode,
  signInWithPasskey,
} from "@/features/account/auth-client";
import { forgetSignIn, rememberSignIn } from "@/features/account/pending-sign-in";
import { safeRedirect } from "@/features/account/redirect";
import { forgetAccount } from "@/features/account/session";
import { signInTitleId } from "@/features/account/sign-in-card";
import { authorizeContinuation } from "@/features/connections/oauth";
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { emailKey } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

type Search = { redirect?: string };

export const Route = createFileRoute("/sign-in/")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: ({ location }) => {
    const continuation = authorizeContinuation(location.searchStr);
    if (continuation) throw redirect({ to: "/sign-in", search: { redirect: continuation } });
  },
  component: EmailStep,
});

function EmailStep() {
  const { redirect: requested } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  // Known only in the browser; the server renders the page without the button.
  const [passkeys, setPasskeys] = useState(false);
  // The latest passkey ceremony, so an autofill one that the button replaced says nothing when it ends.
  const ceremony = useRef(0);

  /** Lands where a code would have (DS-90): the page the person asked for, else the collection. */
  async function passkeyDone(result: AuthResult, attempt: number) {
    if (attempt !== ceremony.current) return;
    if (result.ok) {
      forgetSignIn();
      forgetAccount();
      router.history.push(safeRedirect(requested));
      return;
    }
    setSending(false);
    if (result.reason !== "cancelled") setError(authFailureMessage(result));
  }

  // The email field offers saved passkeys while the page is open, where the browser can (TON-143).
  useEffect(() => {
    setPasskeys(browserSupportsWebAuthn());
    let open = true;
    async function offerSaved() {
      if (!(await browserSupportsWebAuthnAutofill()) || !open) return;
      const attempt = ++ceremony.current;
      await passkeyDone(await signInWithPasskey({ autofill: true }), attempt);
    }
    void offerSaved();
    return () => {
      open = false;
      cancelPasskeyPrompt();
    };
    // Once, on arrival; `requested` is read when a passkey is chosen.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function passkeySignIn() {
    const attempt = ++ceremony.current;
    setSending(true);
    setError(undefined);
    await passkeyDone(await signInWithPasskey(), attempt);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = new FormData(event.currentTarget).get("email");
    const email = emailKey(typeof typed === "string" ? typed : "");
    setSending(true);
    setError(undefined);
    const result = await requestSignInCode(email);
    setSending(false);
    if (!result.ok) {
      setError(authFailureMessage(result));
      return;
    }
    rememberSignIn(email, safeRedirect(requested));
    await navigate({ to: "/sign-in/verify", search: { email, redirect: requested } });
  }

  return (
    <>
      <h1 id={signInTitleId} className="text-title text-fg-primary">
        Sign in
      </h1>
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            // `webauthn` lets the browser offer saved passkeys here, as well as addresses.
            autoComplete="username webauthn"
            required
            // The page's only task, so the field takes focus on arrival.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "email-error" : undefined}
          />
        </div>
        {error && (
          <p id="email-error" role="alert" className="text-status-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={sending}>
          Continue
        </Button>
        {passkeys && (
          <Button type="button" size="lg" disabled={sending} onClick={() => void passkeySignIn()}>
            Sign in with a passkey
          </Button>
        )}
      </form>
      <Link
        to="/help/recovery"
        className="self-start text-accent-solid underline-offset-4 hover:underline"
      >
        Lost access to your email?
      </Link>
    </>
  );
}
