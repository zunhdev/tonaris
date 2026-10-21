// `/sign-in` (DS-90): an email field and **Continue**. Every address gets the same next step, so the page reveals
// nothing about who has an account; the email itself says when there is none. When the API's authorization
// server sends someone here to connect an AI client (TS-61), signing in continues that request.

import { authFailureMessage, requestSignInCode } from "@/features/account/auth-client";
import { rememberSignIn } from "@/features/account/pending-sign-in";
import { safeRedirect } from "@/features/account/redirect";
import { signInTitleId } from "@/features/account/sign-in-card";
import { authorizeContinuation } from "@/features/connections/oauth";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

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
            autoComplete="email"
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
      </form>
    </>
  );
}
