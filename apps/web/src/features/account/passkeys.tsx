// Settings → Account's passkeys (DS-93, TON-143): the account's passkeys, newest first, each with its name and the
// day it was added, to rename or remove; and **Add a passkey**. Adding one needs a session from the last day, so an
// older one first confirms with a code emailed to the sign-in address, and then the person chooses Add again, since
// Safari lets a passkey be created only right after a tap.

import { api, refusalOf } from "@/api";
import {
  addPasskey,
  authFailureMessage,
  requestSignInCode,
  signInWithCode,
} from "@/features/account/auth-client";
import { CodeField, useResendCountdown } from "@/features/account/code-field";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { type Account, type Passkey, signInCode } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Input } from "@tonaris/ui/components/input";

const unreachable = "Couldn't reach Tonaris. Try again.";
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Where adding stands: as usual, waiting for the confirming code, or confirmed and ready to add. */
type Confirmation = "none" | "code" | "confirmed";

export function Passkeys({ account, passkeys }: { account: Account; passkeys: Passkey[] }) {
  const id = useId();
  const router = useRouter();
  // Known only in the browser; the server renders the list without the button.
  const [supported, setSupported] = useState<boolean>();
  const [confirmation, setConfirmation] = useState<Confirmation>("none");
  const [renaming, setRenaming] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    // Browser-only, after hydration.
    // oxlint-disable-next-line react/set-state-in-effect
    setSupported(browserSupportsWebAuthn());
  }, []);

  function reset() {
    setError(undefined);
    setNotice(undefined);
  }

  async function add() {
    setBusy(true);
    reset();
    const result = await addPasskey();
    if (result.ok) {
      setConfirmation("none");
      await router.invalidate();
      setBusy(false);
      setNotice("Passkey added.");
      return;
    }
    if (result.reason === "not_fresh") {
      const sent = await requestSignInCode(account.email);
      setBusy(false);
      if (sent.ok) setConfirmation("code");
      else setError(authFailureMessage(sent));
      return;
    }
    setBusy(false);
    if (result.reason !== "cancelled") setError(authFailureMessage(result));
  }

  async function remove(passkey: Passkey) {
    setBusy(true);
    reset();
    try {
      const { error: failed } = await api.v1.account.passkeys({ id: passkey.id }).delete();
      if (failed && failed.status !== 404) {
        setError("Couldn't remove the passkey. Try again.");
        return;
      }
      await router.invalidate();
      setNotice(`Removed ${passkey.name}. It no longer signs in.`);
    } catch {
      setError(unreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-passkeys`} className="flex flex-col gap-3">
      <h2 id={`${id}-passkeys`} className="text-title text-fg-primary">
        Passkeys
      </h2>
      <p className="text-fg-secondary">
        Sign in with your face, fingerprint or screen lock instead of an emailed code. Email codes
        keep working.
      </p>
      {passkeys.length === 0 ? (
        <p className="text-fg-secondary">No passkeys yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-subtle rounded-lg border border-subtle">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center gap-3 px-3 py-2.5">
              {renaming === passkey.id ? (
                <RenameForm
                  passkey={passkey}
                  onDone={(renamed) => {
                    setRenaming(undefined);
                    if (renamed) setNotice(undefined);
                  }}
                />
              ) : (
                <>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-fg-primary">{passkey.name}</span>
                    <span className="text-small text-fg-secondary">
                      Added {date.format(new Date(passkey.createdAt))}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Rename ${passkey.name}`}
                    onClick={() => {
                      reset();
                      setRenaming(passkey.id);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    aria-label={`Remove ${passkey.name}`}
                    onClick={() => void remove(passkey)}
                  >
                    Remove
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <output className="block text-fg-secondary empty:hidden">{notice}</output>
      {error && (
        <p role="alert" className="text-status-danger">
          {error}
        </p>
      )}
      {confirmation === "code" ? (
        <ConfirmItsYou
          email={account.email}
          onConfirmed={() => setConfirmation("confirmed")}
          onCancelled={() => setConfirmation("none")}
        />
      ) : supported === false ? (
        <p className="text-fg-secondary">This browser can't add passkeys.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {confirmation === "confirmed" && (
            <p className="text-fg-secondary">Confirmed. Now add your passkey.</p>
          )}
          <Button
            variant={confirmation === "confirmed" ? "primary" : "secondary"}
            className="self-start"
            disabled={busy || supported === undefined}
            onClick={() => void add()}
          >
            Add a passkey
          </Button>
        </div>
      )}
    </section>
  );
}

/** A passkey's new name, in place of its row; Escape or Cancel keeps the old one. */
function RenameForm({ passkey, onDone }: { passkey: Passkey; onDone: (renamed: boolean) => void }) {
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState(passkey.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const { error: failed } = await api.v1.account.passkeys({ id: passkey.id }).patch({ name });
      const reason = refusalOf(failed, unreachable);
      if (reason) {
        setError(reason);
        return;
      }
      await router.invalidate();
      onDone(true);
    } catch {
      setError(unreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-1 flex-col gap-2" onSubmit={(event) => void submit(event)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Passkey name"
          value={name}
          className="max-w-sm flex-1"
          // Renaming is the row's only task now, so the field takes focus.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onDone(false);
          }}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-status-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** Confirms an older session with a code to the sign-in address, which signs this browser in afresh. */
function ConfirmItsYou({
  email,
  onConfirmed,
  onCancelled,
}: {
  email: string;
  onConfirmed: () => void;
  onCancelled: () => void;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const codeInput = useRef<HTMLInputElement>(null);
  const { resendIn, restart } = useResendCountdown(email);

  async function submit(value: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const result = await signInWithCode(email, value);
    setBusy(false);
    if (result.ok) {
      onConfirmed();
      return;
    }
    setCode("");
    setError(authFailureMessage(result));
    codeInput.current?.focus();
  }

  async function resend() {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const result = await requestSignInCode(email);
    setBusy(false);
    if (!result.ok) {
      setError(authFailureMessage(result));
      return;
    }
    restart();
    setCode("");
    setNotice(`We sent a new code to ${email}.`);
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
    <div className="flex flex-col gap-3 rounded-lg border border-subtle p-4">
      <h3 className="text-base font-medium [overflow-wrap:anywhere] text-fg-primary">
        Check {email}
      </h3>
      <form className="flex max-w-sm flex-col gap-3" onSubmit={onSubmit}>
        <CodeField
          id={`${id}-code`}
          value={code}
          onChange={onCodeChange}
          hint="To add a passkey, confirm it's you with the code we sent to your sign-in email."
          error={error}
          inputRef={codeInput}
        />
        <Button type="submit" variant="primary" className="self-start" disabled={busy}>
          Continue
        </Button>
      </form>
      <output className="text-fg-secondary empty:hidden">{notice}</output>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={busy || resendIn > 0} onClick={() => void resend()}>
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancelled}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
