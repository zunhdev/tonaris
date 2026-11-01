// The sign-in this browser asked for (DS-90). When the email's link opens here, the code is submitted at once;
// anywhere else the page first asks "Sign in on this device?". Only a heuristic: the code is the credential.

import { forget, readJson, storageOf, writeJson } from "@/features/shell/storage";

import { signInCode } from "@tonaris/domain";

export type PendingSignIn = { email: string; redirect: string; at: number };

const key = "tonaris.pending-sign-in";

/** Without storage, the link asks first; nothing else changes. */
export function rememberSignIn(
  email: string,
  redirect: string,
  store = storageOf(),
  now = Date.now(),
): void {
  const pending: PendingSignIn = { email, redirect, at: now };
  writeJson(key, pending, store);
}

/** The pending sign-in for `email`, while its code can still be valid. */
export function pendingSignIn(
  email: string,
  store = storageOf(),
  now = Date.now(),
): PendingSignIn | undefined {
  const value = readJson(key, store);
  if (typeof value !== "object" || value === null) return undefined;
  if (!("email" in value) || !("redirect" in value) || !("at" in value)) return undefined;
  const { email: stored, redirect, at } = value;
  if (stored !== email || typeof redirect !== "string" || typeof at !== "number") return undefined;
  if (now - at > signInCode.validMinutes * 60_000) return undefined;
  return { email: stored, redirect, at };
}

export function forgetSignIn(store = storageOf()): void {
  forget(key, store);
}
