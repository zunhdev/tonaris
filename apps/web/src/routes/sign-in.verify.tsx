// `/sign-in/verify` (DS-90): "Check {email}", the 6-digit code, a resend button after 30 seconds and "Use a
// different email". The email's link opens this page with the code in its fragment. In the browser that asked
// for the code it signs in at once; anywhere else it first asks "Sign in on this device?", so a link opened
// elsewhere, or by a mail scanner, never spends the code unasked (TS-70; features/account/code-entry.ts).

import { requestSignInCode, signInWithCode } from "@/features/account/auth-client";
import { resendLabel, useEmailedCode } from "@/features/account/code-entry";
import { CodeField } from "@/features/account/code-field";
import { forgetSignIn, pendingSignIn, rememberSignIn } from "@/features/account/pending-sign-in";
import { safeRedirect } from "@/features/account/redirect";
import { forgetAccount } from "@/features/account/session";
import { signInTitleId } from "@/features/account/sign-in-card";
import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";

import { Button } from "@tonaris/ui/components/button";

type Search = { email: string; redirect?: string };

export const Route = createFileRoute("/sign-in/verify")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    email: typeof search.email === "string" ? search.email : "",
    ...(typeof search.redirect === "string" ? { redirect: search.redirect } : {}),
  }),
  beforeLoad: ({ search }) => {
    if (!search.email) throw redirect({ to: "/sign-in" });
  },
  component: VerifyStep,
});

function VerifyStep() {
  const { email, redirect: requested } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();

  /** Where to land: the page the person started from, else the collection. */
  const destination = () => safeRedirect(requested ?? pendingSignIn(email)?.redirect);

  const entry = useEmailedCode({
    email,
    attempt: (code) => signInWithCode(email, code),
    succeeded: () => {
      const target = destination();
      forgetSignIn();
      forgetAccount();
      router.history.push(target);
      return Promise.resolve(undefined);
    },
    request: () => requestSignInCode(email),
    requested: () => rememberSignIn(email, destination()),
    clearLink: () =>
      void navigate({
        to: "/sign-in/verify",
        search: { email, redirect: requested },
        replace: true,
      }),
  });
  const { step, busy, error } = entry;

  const errorLine = error && (
    <p id="code-error" role="alert" className="text-status-danger">
      {error}
    </p>
  );

  if (step.kind === "using-link") {
    return (
      <h1 id={signInTitleId} className="text-title text-fg-primary" aria-live="polite">
        Signing you in…
      </h1>
    );
  }

  if (step.kind === "confirm") {
    return (
      <>
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          Sign in on this device?
        </h1>
        <p className="[overflow-wrap:anywhere] text-fg-secondary">
          This link signs in to Tonaris as {email}.
        </p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            disabled={busy}
            onClick={() => entry.confirmLink(step.code)}
          >
            Sign in
          </Button>
          <Button size="lg" disabled={busy} onClick={() => void navigate({ to: "/sign-in" })}>
            Cancel
          </Button>
        </div>
      </>
    );
  }

  if (step.kind === "link-spent") {
    return (
      <>
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          This sign-in link has expired or was already used
        </h1>
        {errorLine}
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void entry.sendCode()}>
          Send a new code
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 id={signInTitleId} className="text-title [overflow-wrap:anywhere] text-fg-primary">
        Check {email}
      </h1>
      <form className="flex flex-col gap-3" onSubmit={entry.onSubmit}>
        <CodeField
          value={entry.code}
          onChange={entry.onCodeChange}
          hint="Or open the link in the email to sign in on that device."
          error={error}
          inputRef={entry.codeInput}
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Sign in
        </Button>
      </form>
      <output className="text-fg-secondary empty:hidden">{entry.notice}</output>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          disabled={busy || entry.resendIn > 0}
          onClick={() => void entry.sendCode()}
        >
          {resendLabel(entry.resendIn)}
        </Button>
        <Link
          to="/sign-in"
          search={requested ? { redirect: requested } : {}}
          className="text-accent-solid underline-offset-4 hover:underline"
        >
          Use a different email
        </Link>
      </div>
    </>
  );
}
