// `/join/:token` (DS-91): an admission invitation's landing. It shows the address the invitation is bound to;
// Continue emails a code there, and the code, typed or through the email's link, creates the account and signs
// in (features/account/code-entry.ts). Then an optional display name, and the collection's first run. Continuing
// agrees to the terms and the privacy notice, as the page says, and the API records it (TON-131). An invitation that
// can't be used gets its one sentence and nothing else. Client-rendered: the lookup and the link's code need the
// browser (TS-71). The URL carries the token, so the page sends no Referer (security/headers.ts).

import {
  type AuthFailure,
  authFailureMessage,
  joinWithCode,
  lookUpInvitation,
  requestJoinCode,
} from "@/features/account/auth-client";
import { resendLabel, useEmailedCode } from "@/features/account/code-entry";
import { CodeField } from "@/features/account/code-field";
import { forgetSignIn, rememberSignIn } from "@/features/account/pending-sign-in";
import { currentAccount, forgetAccount } from "@/features/account/session";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { failureOf, sendNow } from "@/features/sharing/send";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { maxNameLength } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

export const Route = createFileRoute("/join/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Join · Tonaris" }, { name: "robots", content: "noindex" }] }),
  loader: ({ params }) => lookUpInvitation(params.token),
  component: JoinPage,
});

/** Joining's steps besides the code's: the invitation, the display name, and an invitation that can't be used. */
type JoinStep = { kind: "invited" } | { kind: "name" } | { kind: "refused"; sentence: string };

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

/** A refusal the API explains ends the join with its sentence. */
const refusedStep = (failure: AuthFailure): JoinStep | undefined =>
  failure.reason === "refused" ? { kind: "refused", sentence: failure.detail } : undefined;

function Join({ email }: { email: string }) {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const entry = useEmailedCode<JoinStep>({
    email,
    initial: { kind: "invited" },
    attempt: (code) => joinWithCode(token, code),
    succeeded: async () => {
      forgetSignIn();
      forgetAccount();
      // Someone who already had an account and a name signs in through the invitation; they go straight on.
      const account = await currentAccount().catch(() => undefined);
      if (!account?.displayName) return { kind: "name" };
      await navigate({ to: "/c" });
      return undefined;
    },
    ended: refusedStep,
    request: () => requestJoinCode(token),
    // So the email's link joins at once in this browser, as sign-in's does.
    requested: () => rememberSignIn(email, "/c"),
    clearLink: () => void navigate({ to: "/join/$token", params: { token }, replace: true }),
  });
  const { step, busy, error } = entry;

  const errorLine = error && (
    <p id="join-error" role="alert" className="text-status-danger">
      {error}
    </p>
  );

  if (step.kind === "refused") return <Refused sentence={step.sentence} />;

  if (step.kind === "name") return <NameStep onDone={() => void navigate({ to: "/c" })} />;

  if (step.kind === "using-link") {
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
            onClick={() => entry.confirmLink(step.code)}
          >
            Join
          </Button>
          <Button size="lg" disabled={busy} onClick={() => entry.setStep({ kind: "invited" })}>
            Cancel
          </Button>
        </div>
        <Agreement />
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
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void entry.sendCode()}>
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
        <Button
          variant="primary"
          size="lg"
          disabled={busy}
          onClick={() => void entry.sendCode({ notify: false })}
        >
          Continue
        </Button>
        <Agreement />
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
          hint="Or open the link in the email to join on that device."
          error={error}
          inputRef={entry.codeInput}
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          Join
        </Button>
      </form>
      <output className="text-fg-secondary empty:hidden">{entry.notice}</output>
      <Button
        variant="ghost"
        className="self-start"
        disabled={busy || entry.resendIn > 0}
        onClick={() => void entry.sendCode()}
      >
        {resendLabel(entry.resendIn)}
      </Button>
    </>
  );
}

/** What continuing means (TON-131): the API records the agreement when the code creates the account. */
function Agreement() {
  return (
    <p className="text-small text-fg-secondary">
      By continuing, you agree to the{" "}
      <Link to="/terms" target="_blank" className="text-accent-solid underline underline-offset-4">
        Terms of use
      </Link>{" "}
      and the{" "}
      <Link
        to="/privacy"
        target="_blank"
        className="text-accent-solid underline underline-offset-4"
      >
        Privacy notice
      </Link>
      .
    </p>
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
