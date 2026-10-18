// Accounts (FR-11): how an email address identifies an account, the roles, and the signed-in account as every
// client sees it (`GET /v1/me`).

import { z } from "./zod";

/** The sign-in code rules (TS-70): 6 digits, valid for 10 minutes, single-use, with 5 attempts. */
export const signInCode = { length: 6, validMinutes: 10, attempts: 5 } as const;

/** `creator` adds admission administration, never access to other people's data (TS-30). */
export const userRoles = ["creator", "user"] as const;
export type UserRole = (typeof userRoles)[number];

/**
 * The key an account's email is stored and matched under (TS-70): trimmed, lowercased, and with an
 * internationalized domain converted to ASCII. Plus-addresses are kept as they are, so `a+b@x` and `a@x`
 * are different accounts.
 */
export function emailKey(email: string): string {
  const lowered = email.trim().toLowerCase();
  const at = lowered.lastIndexOf("@");
  if (at < 0) return lowered;
  return `${lowered.slice(0, at)}@${asciiDomain(lowered.slice(at + 1))}`;
}

/** IDNA to ASCII through the URL parser, which browsers and Bun both have. */
function asciiDomain(domain: string): string {
  // Plain ASCII needs nothing; a value URL syntax would reinterpret ("x.com/y") is left for validation to reject.
  if (/^[ -~]*$/.test(domain) || /[\s/?#@:\\%[\]]/.test(domain)) return domain;
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return domain;
  }
}

/** The signed-in account (`GET /v1/me`). */
export const accountSchema = z
  .object({
    id: z.uuid(),
    email: z.string().meta({ description: "The sign-in email, as its email key." }),
    displayName: z
      .string()
      .nullable()
      .meta({ description: "The display name (FR-11.3); null until the person sets one." }),
    role: z.enum(userRoles),
  })
  .meta({ description: "The signed-in account." });
export type Account = z.infer<typeof accountSchema>;
