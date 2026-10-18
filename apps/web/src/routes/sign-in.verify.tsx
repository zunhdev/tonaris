// `/sign-in/verify` (DS-90): "Check {email}", the 6-digit code, a resend button after 30 seconds and "Use a
// different email". The email's link opens this page with the code in its fragment. In the browser that asked
// for the code it signs in at once; anywhere else it first asks "Sign in on this device?", so a link opened
// elsewhere, or by a mail scanner, never spends the code unasked (TS-70).

import {
  type AuthFailure,
  authFailureMessage,
  requestSignInCode,
  signInWithCode,
} from "@/features/account/auth-client";
import { forgetSignIn, pendingSignIn, rememberSignIn } from "@/features/account/pending-sign-in";
import { safeRedirect } from "@/features/account/redirect";
import { forgetAccount } from "@/features/account/session";
import { signInTitleId } from "@/features/account/sign-in-card";
import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { signInCode } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

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

const resendAfterSeconds = 30;

/** A link's code that no longer works: the page offers a new code instead of the code field. */
const spentLink = new Set<AuthFailure["reason"]>(["wrong_code", "expired", "too_many_attempts"]);

type Step =
  | { kind: "code" }
  | { kind: "confirm"; code: string }
  | { kind: "signing-in" }
  | { kind: "link-spent" };

function VerifyStep() {
  const { email, redirect: requested } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: "code" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const codeInput = useRef<HTMLInputElement>(null);
  // The link's code once handled, so neither a second effect run nor a repeated event submits it twice.
  const handledLinkCode = useRef<string>(undefined);

  // The resend countdown starts when the code was requested here, or on arrival from a link. It is computed
  // only in the browser, so the server and the first client render agree.
  const [sentAt, setSentAt] = useState<number>();
  const [now, setNow] = useState<number>();
  useEffect(() => {
    setSentAt(pendingSignIn(email)?.at ?? Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [email]);
  const resendIn =
    sentAt === undefined
      ? resendAfterSeconds
      : Math.max(0, Math.ceil((sentAt + resendAfterSeconds * 1000 - (now ?? sentAt)) / 1000));

  /** Where to land: the page the person started from, else the collection. */
  const destination = () => safeRedirect(requested ?? pendingSignIn(email)?.redirect);

  async function submit(value: string, fromLink: boolean) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const result = await signInWithCode(email, value);
    if (result.ok) {
      const target = destination();
      forgetSignIn();
      forgetAccount();
      router.history.push(target);
      return;
    }
    setBusy(false);
    if (fromLink && spentLink.has(result.reason)) {
      setStep({ kind: "link-spent" });
      return;
    }
    setStep({ kind: "code" });
    setCode("");
    setError(authFailureMessage(result));
    codeInput.current?.focus();
  }

  async function sendNewCode() {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const result = await requestSignInCode(email);
    setBusy(false);
    if (!result.ok) {
      setError(authFailureMessage(result));
      return;
    }
    rememberSignIn(email, destination());
    setSentAt(Date.now());
    setCode("");
    setStep({ kind: "code" });
    setNotice(`We sent a new code to ${email}.`);
  }

  // The email's link: take the code out of the URL, then sign in or ask first. It may open a new page, or
  // change only the fragment of this one.
  useEffect(() => {
    function openLink() {
      const linkCode = new URLSearchParams(window.location.hash.slice(1)).get("code");
      if (!linkCode || linkCode === handledLinkCode.current) return;
      handledLinkCode.current = linkCode;
      void navigate({
        to: "/sign-in/verify",
        search: { email, redirect: requested },
        replace: true,
      });
      if (pendingSignIn(email)) {
        setStep({ kind: "signing-in" });
        void submit(linkCode, true);
      } else {
        setStep({ kind: "confirm", code: linkCode });
      }
    }
    openLink();
    window.addEventListener("hashchange", openLink);
    return () => window.removeEventListener("hashchange", openLink);
    // `submit` and `navigate` read the current email; the listener is set up once.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCodeChange(value: string) {
    // Pasted codes may carry spaces or a dash; only the digits count.
    const digits = value.replaceAll(/\D/g, "").slice(0, signInCode.length);
    setCode(digits);
    if (digits.length === signInCode.length && !busy) void submit(digits, false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length === signInCode.length) void submit(code, false);
    else setError(`Enter the ${signInCode.length}-digit code from the email.`);
  }

  const errorLine = error && (
    <p id="code-error" role="alert" className="text-status-danger">
      {error}
    </p>
  );

  if (step.kind === "signing-in") {
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
            onClick={() => void submit(step.code, true)}
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
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void sendNewCode()}>
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
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Code</Label>
          <Input
            ref={codeInput}
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            // The page's only task, so the field takes focus on arrival.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="font-medium tracking-[0.3em]"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "code-hint code-error" : "code-hint"}
          />
          <p id="code-hint" className="text-fg-secondary">
            Or open the link in the email to sign in on that device.
          </p>
        </div>
        {errorLine}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Sign in
        </Button>
      </form>
      <output className="text-fg-secondary empty:hidden">{notice}</output>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" disabled={busy || resendIn > 0} onClick={() => void sendNewCode()}>
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
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
