// Settings → Account (DS-93, FR-11.4): the sign-in email, and changing it in three steps: the new address, the
// code sent to the current address, then the code sent to the new one. The swap keeps the account and signs its
// other sessions out (TS-73). Cancelling at any step changes nothing, and a change in progress resumes here.

import { api, refusalOf } from "@/api";
import { CodeField, useResendCountdown } from "@/features/account/code-field";
import { forgetAccount } from "@/features/account/session";
import { SettingsNav } from "@/features/settings/settings-nav";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useRef, useState } from "react";

import { type EmailChangeStage, signInCode } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

export const Route = createFileRoute("/_workspace/settings/account")({
  head: () => ({ meta: [{ title: "Account · Tonaris" }] }),
  loader: async () => {
    const { data, status } = await api.v1.account["email-change"].get();
    if (!data) throw new Error(`Couldn't load the email change (HTTP ${status}).`);
    return data.change;
  },
  component: AccountPage,
});

const unreachable = "Couldn't reach Tonaris. Try again.";

type Step =
  | { kind: "idle" }
  | { kind: "address" }
  | { kind: "code"; stage: EmailChangeStage; newEmail: string }
  | { kind: "done"; email: string };

function AccountPage() {
  const { account } = Route.useRouteContext();
  const inProgress = Route.useLoaderData();
  const id = useId();
  const [step, setStep] = useState<Step>(
    inProgress ? { kind: "code", ...inProgress } : { kind: "idle" },
  );

  return (
    <>
      <PageHeader title="Account" />
      <SettingsNav />
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
            <Button className="self-start" onClick={() => setStep({ kind: "address" })}>
              Change sign-in email
            </Button>
          ) : (
            <ChangeEmail
              currentEmail={account.email}
              step={step}
              onStep={setStep}
              onCancelled={() => setStep({ kind: "idle" })}
            />
          )}
        </section>
      </div>
    </>
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
  const id = useId();
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-new`}>New email address</Label>
        <Input
          id={`${id}-new`}
          type="email"
          autoComplete="email"
          required
          value={newEmail}
          className="max-w-sm"
          // The step's only task, so the field takes focus on arrival.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setNewEmail(event.target.value);
            setError(undefined);
          }}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-status-danger">
          {error}
        </p>
      )}
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
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const codeInput = useRef<HTMLInputElement>(null);
  const { resendIn, restart } = useResendCountdown(address);
  const emailChange = api.v1.account["email-change"];

  async function submit(value: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { data, error: failed } = await emailChange.verify.post({ code: value });
      if (!data) {
        setBusy(false);
        setCode("");
        setError(refusalOf(failed, unreachable));
        codeInput.current?.focus();
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
      setBusy(false);
      setError(unreachable);
    }
  }

  async function resend() {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { data, error: failed } = await emailChange.resend.post({});
      if (data) {
        restart();
        setCode("");
        setNotice(`We sent a new code to ${address}.`);
      } else {
        setError(refusalOf(failed, unreachable));
      }
    } catch {
      setError(unreachable);
    } finally {
      setBusy(false);
    }
  }

  function onCodeChange(digits: string) {
    setCode(digits);
    if (digits.length === signInCode.length && !busy) void submit(digits);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (code.length === signInCode.length) void submit(code);
    else setError(`Enter the ${signInCode.length}-digit code from the email.`);
  }

  return (
    <>
      <h3 className="text-base font-medium [overflow-wrap:anywhere] text-fg-primary">
        Check {address}
      </h3>
      <form className="flex max-w-sm flex-col gap-3" onSubmit={onSubmit}>
        <CodeField
          value={code}
          onChange={onCodeChange}
          hint={
            stage === "current"
              ? "We sent a code to your current address, to confirm it's you."
              : "We sent a code to the new address, to confirm it's yours."
          }
          error={error}
          inputRef={codeInput}
        />
        <Button type="submit" variant="primary" className="self-start" disabled={busy}>
          {stage === "current" ? "Continue" : "Change email"}
        </Button>
      </form>
      <output className="text-fg-secondary empty:hidden">{notice}</output>
      <Button
        variant="ghost"
        className="self-start"
        disabled={busy || resendIn > 0}
        onClick={() => void resend()}
      >
        {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
      </Button>
    </>
  );
}
