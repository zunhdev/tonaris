// The emailed code, as sign-in (DS-90) and joining (DS-91) ask for it: a field that takes six digits, autofill
// (`one-time-code`) and a pasted code with spaces or a dash, with its hint and error under it; and the resend
// countdown, 30 seconds from when the code was asked for.

import { type Ref, useEffect, useState } from "react";

import { signInCode } from "@tonaris/domain";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

import { pendingSignIn } from "./pending-sign-in";

/** A code's digits: pasted codes may carry spaces or a dash, and only the digits count. */
export function codeDigits(value: string): string {
  return value.replaceAll(/\D/g, "").slice(0, signInCode.length);
}

export function CodeField({
  id = "code",
  value,
  onChange,
  hint,
  error,
  inputRef,
}: {
  /** The field's id, for a page with two code fields at once (Settings → Account). */
  id?: string;
  value: string;
  /** The digits so far; the page submits six by themselves. */
  onChange: (digits: string) => void;
  hint: string;
  error: string | undefined;
  inputRef: Ref<HTMLInputElement>;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Code</Label>
        <Input
          ref={inputRef}
          id={id}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          // The page's only task, so the field takes focus on arrival.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="font-medium tracking-[0.3em]"
          value={value}
          onChange={(event) => onChange(codeDigits(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-fg-secondary">
          {hint}
        </p>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-status-danger">
          {error}
        </p>
      )}
    </>
  );
}

const resendAfterSeconds = 30;

/**
 * Seconds until a new code may be asked for: 30 after this browser asked for one (`pendingSignIn`), or after the
 * page opened. `restart()` counts again after a resend. It is computed only in the browser, so the server and the
 * first client render agree.
 */
export function useResendCountdown(email: string): { resendIn: number; restart: () => void } {
  const [sentAt, setSentAt] = useState<number>();
  const [now, setNow] = useState<number>();
  useEffect(() => {
    // Browser-only, after hydration: storage and the clock aren't there for the server's render.
    // oxlint-disable-next-line react/set-state-in-effect
    setSentAt(pendingSignIn(email)?.at ?? Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [email]);
  const resendIn =
    sentAt === undefined
      ? resendAfterSeconds
      : Math.max(0, Math.ceil((sentAt + resendAfterSeconds * 1000 - (now ?? sentAt)) / 1000));
  return { resendIn, restart: () => setSentAt(Date.now()) };
}
