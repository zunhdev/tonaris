// The sign-in this browser asked for (DS-90). When the email's link opens here, the code is submitted at once;
// anywhere else the page first asks "Sign in on this device?". Only a heuristic: the code is the credential.

import { signInCode } from "@tonaris/domain";

export type PendingSignIn = { email: string; redirect: string; at: number };

const key = "tonaris.pending-sign-in";

/** `localStorage`, or nothing where it is unavailable (server rendering, blocked storage). */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function rememberSignIn(
  email: string,
  redirect: string,
  store = storage(),
  now = Date.now(),
): void {
  const pending: PendingSignIn = { email, redirect, at: now };
  try {
    store?.setItem(key, JSON.stringify(pending));
  } catch {
    // Without storage, the link asks first; nothing else changes.
  }
}

/** The pending sign-in for `email`, while its code can still be valid. */
export function pendingSignIn(
  email: string,
  store = storage(),
  now = Date.now(),
): PendingSignIn | undefined {
  let value: unknown;
  try {
    value = JSON.parse(store?.getItem(key) ?? "null");
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  if (!("email" in value) || !("redirect" in value) || !("at" in value)) return undefined;
  const { email: stored, redirect, at } = value;
  if (stored !== email || typeof redirect !== "string" || typeof at !== "number") return undefined;
  if (now - at > signInCode.validMinutes * 60_000) return undefined;
  return { email: stored, redirect, at };
}

export function forgetSignIn(store = storage()): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing stored, nothing to forget.
  }
}
