// One-time codes sent by email (TS-70, TS-73): a sign-in email change's and an email recovery's code works until it
// expires, for `signInCode.attempts` wrong tries. Storage compares the code and counts a wrong one.

import { signInCode } from "./accounts";

/** Why a stored code can't be tried now: past its expiry, or out of tries. */
export type CodeRefusal = "expired" | "locked";

/** The refusal that holds for a stored code at `now`, before it is compared; none while it can be tried. */
export function codeRefusal(
  code: { expiresAt: Date; attempts: number },
  now = new Date(),
): CodeRefusal | undefined {
  if (code.expiresAt <= now) return "expired";
  if (code.attempts >= signInCode.attempts) return "locked";
  return undefined;
}
