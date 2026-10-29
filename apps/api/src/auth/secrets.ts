// The secrets that go out by email (TS-70, TS-71, TS-73): six-digit codes and link tokens. The database keeps only
// their SHA-256.

import { signInCode } from "@tonaris/domain";

/** The largest multiple of 1,000,000 below 2^32: values from it up would favour the low codes. */
const unbiasedLimit = 4_294_000_000;

/** Six random digits, like a sign-in code. */
export function newCode(): string {
  let value: number;
  do [value = unbiasedLimit] = crypto.getRandomValues(new Uint32Array(1));
  while (value >= unbiasedLimit);
  return String(value % 10 ** signInCode.length).padStart(signInCode.length, "0");
}

/** A link's token: 32 random bytes, base64url. */
export function newToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

/** What the database keeps of a code or a token. */
export function sha256(value: string): Buffer {
  return new Bun.CryptoHasher("sha256").update(value).digest();
}

/** A typed or pasted code's digits: spaces and a dash don't count. */
export function codeDigits(code: string): string {
  return code.replaceAll(/\D/g, "");
}
