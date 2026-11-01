// Settings → Account (DS-93, FR-11.4): the sign-in email, and changing it in three steps: the new address, the
// code sent to the current address, then the code sent to the new one. The swap keeps the account and signs its
// other sessions out (TS-73). Cancelling at any step changes nothing, and a change in progress resumes here. Then
// the passkeys (TON-143), and the Danger zone, at the bottom, which deletes the account (DS-97).

import { api, refusalOf } from "@/api";
import { resendLabel, useCodeEntry } from "@/features/account/code-entry";
import { CodeField, useResendCountdown } from "@/features/account/code-field";
import { DangerZone } from "@/features/account/delete-account";
import { Passkeys } from "@/features/account/passkeys";
import { forgetAccount } from "@/features/account/session";
import { Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";

import type { Account, EmailChange, EmailChangeStage, Passkey } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Field } from "@tonaris/ui/components/field";
import { Input } from "@tonaris/ui/components/input";

const unreachable = "Couldn't reach Tonaris. Try again.";

type Step =
  | { kind: "idle" }
  | { kind: "address" }
  | { kind: "code"; stage: EmailChangeStage; newEmail: string }
  | { kind: "done"; email: string };

export function AccountSettings({
  account,
  change: inProgress,
  passkeys,
}: {
  account: Account;
  /** The email change in progress, which resumes at its step. */
  change: EmailChange | null;
  passkeys: Passkey[];
}) {
  const id = useId();
  const [step, setStep] = useState<Step>(
    inProgress ? { kind: "code", ...inProgress } : { kind: "idle" },
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-6">
      <section aria-labelledby={`${id}-email`} className="flex flex-col gap-3">
        <h2 id={`${id}-email`} className="text-title text-fg-primary">
          Sign-in email
        </h2>
        <p className="[overflow-wrap:anywhere] text-fg-primary">{account.email}</p>
        {step.kind === "done" && (
          <output className="block text-fg-secondary">Done — use {step.email} to sign in.</output>
        )}
        {step.kind === "idle" || step.kind === "done" ? (
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => setStep({ kind: "address" })}>Change sign-in email</Button>
            <Link
              to="/help/recovery"
              className="text-accent-solid underline-offset-4 hover:underline"
            >
              Lost access to your email?
            </Link>
          </div>
        ) : (
          <ChangeEmail
            currentEmail={account.email}
            step={step}
            onStep={setStep}
            onCancelled={() => setStep({ kind: "idle" })}
          />
        )}
      </section>
      <Passkeys account={account} passkeys={passkeys} />
      <DangerZone account={account} />
    </div>
  );
}

/** The stepper (DS-93): one step at a time, with Cancel on each. */
function ChangeEmail({
  currentEmail,
  step,
  onStep,
  onCancelled,
}: {
  currentEmail: string;
  step: Extract<Step, { kind: "address" | "code" }>;
  onStep: (step: Step) => void;
  onCancelled: () => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    setError(undefined);
    try {
      const { error: failed } = await api.v1.account["email-change"].delete();
      const reason = refusalOf(failed, unreachable);
      if (reason) setError(reason);
      else onCancelled();
    } catch {
      setError(unreachable);
    } finally {
      setBusy(false);
    }
  }

  const number = step.kind === "address" ? 1 : step.stage === "current" ? 2 : 3;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-subtle p-4">
      <p className="text-small text-fg-secondary">Step {number} of 3</p>
      {step.kind === "address" ? (
        <AddressStep
          onStarted={(newEmail) => onStep({ kind: "code", stage: "current", newEmail })}
        />
      ) : (
        <CodeStep
          key={step.stage}
          address={step.stage === "current" ? currentEmail : step.newEmail}
          stage={step.stage}
          onStep={onStep}
        />
      )}
      {error && (
        <p role="alert" className="text-status-danger">
          {error}
        </p>
      )}
      <Button variant="ghost" className="self-start" disabled={busy} onClick={() => void cancel()}>
        Cancel
      </Button>
    </div>
  );
}

/** Step 1: the new address. Its code goes to the current address. */
function AddressStep({ onStarted }: { onStarted: (newEmail: string) => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const { data, error: failed } = await api.v1.account["email-change"].post({ newEmail });
      if (data) onStarted(data.newEmail);
      else setError(refusalOf(failed, unreachable));
    } catch {
      setError(unreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
      <Field label="New email address" problem={error} announce>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="email"
            required
            value={newEmail}
            className="max-w-sm"
            // The step's only task, so the field takes focus on arrival.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onChange={(event) => {
              setNewEmail(event.target.value);
              setError(undefined);
            }}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" className="self-start" disabled={busy}>
        Continue
      </Button>
    </form>
  );
}

/** Steps 2 and 3: the code sent to the current address, then the one sent to the new address. */
function CodeStep({
  address,
  stage,
  onStep,
}: {
  address: string;
  stage: EmailChangeStage;
  onStep: (step: Step) => void;
}) {
  const router = useRouter();
  const entry = useCodeEntry({ submit: (value) => void submit(value) });
  const { resendIn, restart } = useResendCountdown(address);
  const emailChange = api.v1.account["email-change"];

  async function submit(value: string) {
    entry.begin();
    try {
      const { data, error: failed } = await emailChange.verify.post({ code: value });
      if (!data) {
        entry.refuse(refusalOf(failed, unreachable));
        return;
      }
      if (data.stage === "new") {
        onStep({ kind: "code", stage: "new", newEmail: data.newEmail });
        return;
      }
      // The account menu and this page show the new address.
      forgetAccount();
      await router.invalidate();
      onStep({ kind: "done", email: data.email });
    } catch {
      entry.setBusy(false);
      entry.setError(unreachable);
    }
  }

  async function resend() {
    entry.begin();
    try {
      const { data, error: failed } = await emailChange.resend.post({});
      if (data) {
        restart();
        entry.resent(address);
      } else {
        entry.setError(refusalOf(failed, unreachable));
      }
    } catch {
      entry.setError(unreachable);
    } finally {
      entry.setBusy(false);
    }
  }

  return (
    <>
      <h3 className="text-base font-medium [overflow-wrap:anywhere] text-fg-primary">
        Check {address}
      </h3>
      <form className="flex max-w-sm flex-col gap-3" onSubmit={entry.onSubmit}>
        <CodeField
          value={entry.code}
          onChange={entry.onCodeChange}
          hint={
            stage === "current"
              ? "We sent a code to your current address, to confirm it's you."
              : "We sent a code to the new address, to confirm it's yours."
          }
          error={entry.error}
          inputRef={entry.codeInput}
        />
        <Button type="submit" variant="primary" className="self-start" disabled={entry.busy}>
          {stage === "current" ? "Continue" : "Change email"}
        </Button>
      </form>
      <output className="text-fg-secondary empty:hidden">{entry.notice}</output>
      <Button
        variant="ghost"
        className="self-start"
        disabled={entry.busy || resendIn > 0}
        onClick={() => void resend()}
      >
        {resendLabel(resendIn)}
      </Button>
    </>
  );
}
