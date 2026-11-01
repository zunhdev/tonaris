// The emailed code as the pages that ask for it handle it (DS-90, DS-91, DS-93, TS-70, TS-73). `useCodeEntry` is the
// code field's state: its digits, which submit by themselves once there are six, the error and notice under it, and
// whether its buttons wait. `useEmailedCode` adds what sign-in and joining share: the email's link, whose code arrives
// in the URL's fragment and is used at once in the browser that asked for it, or after a click anywhere else, so a
// link opened elsewhere or by a mail scanner never spends the code unasked; a spent link's screen; and asking for a
// new code, 30 seconds after the last.

import { type FormEvent, useEffect, useRef, useState } from "react";

import { signInCode } from "@tonaris/domain";

import { type AuthFailure, type AuthResult, authFailureMessage } from "./auth-client";
import { useResendCountdown } from "./code-field";
import { pendingSignIn } from "./pending-sign-in";

/** What submitting less than the whole code says. */
export const codeMissing = `Enter the ${signInCode.length}-digit code from the email.`;

/** The resend button's words: the seconds until a new code may be asked for, then "Resend code". */
export const resendLabel = (resendIn: number): string =>
  resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code";

const spentLink = new Set<AuthFailure["reason"]>(["wrong_code", "expired", "too_many_attempts"]);

/** Whether a link's code no longer works: the page then offers a new code instead of the code field. */
export const isSpentLink = (failure: AuthFailure): boolean => spentLink.has(failure.reason);

export type CodeEntry = ReturnType<typeof useCodeEntry>;

export function useCodeEntry({
  submit,
  autoSubmit = true,
}: {
  /** Tries the code. */
  submit: (code: string) => void;
  /** Whether six digits submit by themselves; off where a click must confirm, as for a recovery (TS-73). */
  autoSubmit?: boolean;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const codeInput = useRef<HTMLInputElement>(null);

  return {
    code,
    setCode,
    busy,
    setBusy,
    error,
    setError,
    notice,
    /** The code field, which takes the focus again after a refusal. */
    codeInput,
    /** A request starts: the buttons wait, and the last error and notice go. */
    begin: (): void => {
      setBusy(true);
      setError(undefined);
      setNotice(undefined);
    },
    /** The code was refused: the field empties and takes the focus again, with the reason under it. */
    refuse: (reason: string | undefined): void => {
      setBusy(false);
      setCode("");
      setError(reason);
      codeInput.current?.focus();
    },
    /** A new code went to `address`: the field empties, and the page says so. */
    resent: (address: string): void => {
      setCode("");
      setNotice(`We sent a new code to ${address}.`);
    },
    /** The field's digits so far; six submit by themselves. */
    onCodeChange: (digits: string): void => {
      setCode(digits);
      if (autoSubmit && digits.length === signInCode.length && !busy) submit(digits);
    },
    onSubmit: (event: FormEvent): void => {
      event.preventDefault();
      if (code.length === signInCode.length) submit(code);
      else setError(codeMissing);
    },
  };
}

/**
 * Where an emailed-code page is: the code field, a link's code to confirm on this device, a link's code being used,
 * or a link that no longer works.
 */
export type CodeStep =
  | { kind: "code" }
  | { kind: "confirm"; code: string }
  | { kind: "using-link" }
  | { kind: "link-spent" };

/**
 * Sign-in's and joining's code (DS-90, DS-91): the code field, and the email's link, read from the URL on arrival and
 * whenever only its fragment changes. `Step`, given explicitly, is the page's own steps besides these, such as
 * joining's display name.
 */
export function useEmailedCode<Step extends { kind: string } = never>({
  email,
  initial = { kind: "code" },
  attempt,
  succeeded,
  ended,
  request,
  requested,
  clearLink,
}: {
  /** The address the code went to. */
  email: string;
  initial?: CodeStep | NoInfer<Step>;
  /** Tries a code: signs in, or joins. */
  attempt: (code: string) => Promise<AuthResult>;
  /** After a code worked: the step to show next, or none when the page moves on, its buttons waiting until then. */
  succeeded: () => Promise<CodeStep | NoInfer<Step> | undefined>;
  /** The step a refusal ends the flow at, if it does, such as an invitation that can't be used any more. */
  ended?: (failure: AuthFailure) => NoInfer<Step> | undefined;
  /** Emails a new code. */
  request: () => Promise<AuthResult>;
  /** After a new code went out, before the field shows. */
  requested?: () => void;
  /** Takes the link's code out of the URL. */
  clearLink: () => void;
}) {
  const [step, setStep] = useState<CodeStep | Step>(initial);
  // The link's code once handled, so neither a second effect run nor a repeated event submits it twice.
  const handledLinkCode = useRef<string>(undefined);
  // The resend countdown starts when the code was requested here, or on arrival from a link.
  const { resendIn, restart } = useResendCountdown(email);
  const entry = useCodeEntry({ submit: (value) => void submit(value, false) });

  async function submit(value: string, fromLink: boolean): Promise<void> {
    entry.begin();
    const result = await attempt(value);
    if (result.ok) {
      const next = await succeeded();
      if (next) {
        entry.setBusy(false);
        setStep(next);
      }
      return;
    }
    entry.setBusy(false);
    const end = ended?.(result);
    if (end) {
      setStep(end);
      return;
    }
    if (fromLink && isSpentLink(result)) {
      setStep({ kind: "link-spent" });
      return;
    }
    setStep({ kind: "code" });
    entry.refuse(authFailureMessage(result));
  }

  /** Emails a new code and shows the field, saying so unless `notify` is false, as for the first code. */
  async function sendCode({ notify = true }: { notify?: boolean } = {}): Promise<void> {
    entry.begin();
    const result = await request();
    entry.setBusy(false);
    if (!result.ok) {
      const end = ended?.(result);
      if (end) setStep(end);
      else entry.setError(authFailureMessage(result));
      return;
    }
    requested?.();
    restart();
    setStep({ kind: "code" });
    if (notify) entry.resent(email);
    else entry.setCode("");
  }

  // The email's link: take the code out of the URL, then use it or ask first. It may open a new page, or change only
  // the fragment of this one.
  useEffect(() => {
    function openLink() {
      const linkCode = new URLSearchParams(window.location.hash.slice(1)).get("code");
      if (!linkCode || linkCode === handledLinkCode.current) return;
      handledLinkCode.current = linkCode;
      clearLink();
      if (pendingSignIn(email)) {
        setStep({ kind: "using-link" });
        void submit(linkCode, true);
      } else {
        setStep({ kind: "confirm", code: linkCode });
      }
    }
    openLink();
    window.addEventListener("hashchange", openLink);
    return () => window.removeEventListener("hashchange", openLink);
    // `submit` and `clearLink` read the page as it first rendered; the listener is set up once.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...entry,
    step,
    setStep,
    /** Seconds until a new code may be asked for. */
    resendIn,
    /** Uses the code of a link the person confirmed on this device. */
    confirmLink: (code: string) => void submit(code, true),
    sendCode,
  };
}
