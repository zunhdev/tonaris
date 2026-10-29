// `/join/:token` (DS-91): an admission invitation's landing. It shows the address the invitation is bound to;
// Continue emails a code there, and the code, typed or through the email's link, creates the account and signs
// in. Then an optional display name, and the collection's first run. An invitation that can't be used gets its
// one sentence and nothing else. Client-rendered: the lookup and the link's code need the browser (TS-71). The
// URL carries the token, so the page sends no Referer (security/headers.ts).

import {
  type AuthFailure,
  authFailureMessage,
  joinWithCode,
  lookUpInvitation,
  requestJoinCode,
} from "@/features/account/auth-client";
import { CodeField, useResendCountdown } from "@/features/account/code-field";
import { forgetSignIn, pendingSignIn, rememberSignIn } from "@/features/account/pending-sign-in";
import { currentAccount, forgetAccount } from "@/features/account/session";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { failureOf, sendNow } from "@/features/sharing/send";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { maxNameLength, signInCode } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

export const Route = createFileRoute("/join/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Join · Tonaris" }, { name: "robots", content: "noindex" }] }),
  loader: ({ params }) => lookUpInvitation(params.token),
  component: JoinPage,
});

/** A link's code that no longer works: the page offers a new code instead of the code field. */
const spentLink = new Set<AuthFailure["reason"]>(["wrong_code", "expired", "too_many_attempts"]);

type Step =
  | { kind: "invited" }
  | { kind: "code" }
  | { kind: "confirm"; code: string }
  | { kind: "joining" }
  | { kind: "link-spent" }
  | { kind: "name" }
  | { kind: "refused"; sentence: string };

function JoinPage() {
  const invitation = Route.useLoaderData();
  return (
    <SignInCard>
      {invitation.ok ? (
        <Join email={invitation.email} />
      ) : (
        <Refused sentence={authFailureMessage(invitation)} />
      )}
    </SignInCard>
  );
}

/** An invitation that can't be used: its sentence, and nothing else (DS-91). */
function Refused({ sentence }: { sentence: string }) {
  return (
    <h1 id={signInTitleId} className="text-title text-fg-primary">
      {sentence}
    </h1>
  );
}

function Join({ email }: { email: string }) {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: "invited" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const codeInput = useRef<HTMLInputElement>(null);
  // The link's code once handled, so neither a second effect run nor a repeated event submits it twice.
  const handledLinkCode = useRef<string>(undefined);
  const { resendIn, restart } = useResendCountdown(email);

  async function sendCode(again: boolean) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const result = await requestJoinCode(token);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === "refused") setStep({ kind: "refused", sentence: result.detail });
      else setError(authFailureMessage(result));
      return;
    }
    // So the email's link joins at once in this browser, as sign-in's does.
    rememberSignIn(email, "/c");
    restart();
    setCode("");
    setStep({ kind: "code" });
    if (again) setNotice(`We sent a new code to ${email}.`);
  }

  async function submit(value: string, fromLink: boolean) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const result = await joinWithCode(token, value);
    if (result.ok) {
      forgetSignIn();
      forgetAccount();
      // Someone who already had an account and a name signs in through the invitation; they go straight on.
      const account = await currentAccount().catch(() => undefined);
      setBusy(false);
      if (account?.displayName) await navigate({ to: "/c" });
      else setStep({ kind: "name" });
      return;
    }
    setBusy(false);
    if (result.reason === "refused") {
      setStep({ kind: "refused", sentence: result.detail });
      return;
    }
    if (fromLink && spentLink.has(result.reason)) {
      setStep({ kind: "link-spent" });
      return;
    }
    setStep({ kind: "code" });
    setCode("");
    setError(authFailureMessage(result));
    codeInput.current?.focus();
  }

  // The code email's link: take the code out of the URL, then join or ask first. It may open a new page, or
  // change only the fragment of this one.
  useEffect(() => {
    function openLink() {
      const linkCode = new URLSearchParams(window.location.hash.slice(1)).get("code");
      if (!linkCode || linkCode === handledLinkCode.current) return;
      handledLinkCode.current = linkCode;
      void navigate({ to: "/join/$token", params: { token }, replace: true });
      if (pendingSignIn(email)) {
        setStep({ kind: "joining" });
        void submit(linkCode, true);
      } else {
        setStep({ kind: "confirm", code: linkCode });
      }
    }
    openLink();
    window.addEventListener("hashchange", openLink);
    return () => window.removeEventListener("hashchange", openLink);
    // `submit` and `navigate` read the current invitation; the listener is set up once.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCodeChange(digits: string) {
    setCode(digits);
    if (digits.length === signInCode.length && !busy) void submit(digits, false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length === signInCode.length) void submit(code, false);
    else setError(`Enter the ${signInCode.length}-digit code from the email.`);
  }

  const errorLine = error && (
    <p id="join-error" role="alert" className="text-status-danger">
      {error}
    </p>
  );

  if (step.kind === "refused") return <Refused sentence={step.sentence} />;

  if (step.kind === "name") return <NameStep onDone={() => void navigate({ to: "/c" })} />;

  if (step.kind === "joining") {
    return (
      <h1 id={signInTitleId} className="text-title text-fg-primary" aria-live="polite">
        Creating your account…
      </h1>
    );
  }

  if (step.kind === "confirm") {
    return (
      <>
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          Join on this device?
        </h1>
        <p className="[overflow-wrap:anywhere] text-fg-secondary">
          This link creates your Tonaris account for {email}.
        </p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            disabled={busy}
            onClick={() => void submit(step.code, true)}
          >
            Join
          </Button>
          <Button size="lg" disabled={busy} onClick={() => setStep({ kind: "invited" })}>
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
          This link has expired or was already used
        </h1>
        {errorLine}
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void sendCode(true)}>
          Send a new code
        </Button>
      </>
    );
  }

  if (step.kind === "invited") {
    return (
      <>
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          You're invited to Tonaris
        </h1>
        <p className="[overflow-wrap:anywhere] text-fg-secondary">
          This invitation is for {email}. Continue, and we'll email a code to that address.
        </p>
        {errorLine}
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void sendCode(false)}>
          Continue
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
        <CodeField
          value={code}
          onChange={onCodeChange}
          hint="Or open the link in the email to join on that device."
          error={error}
          inputRef={codeInput}
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Join
        </Button>
      </form>
      <output className="text-fg-secondary empty:hidden">{notice}</output>
      <Button
        variant="ghost"
        className="self-start"
        disabled={busy || resendIn > 0}
        onClick={() => void sendCode(true)}
      >
        {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
      </Button>
    </>
  );
}

/** The optional display name (FR-11.3): shown to people the member shares with, and never taken from the email. */
function NameStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name, or skip this for now.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await sendNow({
        name: "account.setDisplayName",
        args: { displayName: name },
      });
      const reason = failureOf(outcome);
      if (reason) {
        setError(reason);
        return;
      }
      forgetAccount();
      onDone();
    } catch {
      setError("Couldn't reach Tonaris. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 id={signInTitleId} className="text-title text-fg-primary">
        Add a display name
      </h1>
      <p className="text-fg-secondary">
        People you share with see this name instead of your email. You can add this later.
      </p>
      <form className="flex flex-col gap-3" onSubmit={(event) => void save(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={name}
            maxLength={maxNameLength}
            autoComplete="nickname"
            // The step's only task, so the field takes focus on arrival.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "name-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
        </div>
        {error && (
          <p id="name-error" role="alert" className="text-status-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Save
        </Button>
      </form>
      <Button variant="ghost" className="self-start" disabled={busy} onClick={onDone}>
        Skip for now
      </Button>
    </>
  );
}
