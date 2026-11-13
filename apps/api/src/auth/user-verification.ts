// Whether a passkey answer says the authenticator verified the person (TON-143): the UV flag of its authenticator
// data, read before Better Auth's passkey plugin runs. Since 1.7.16 (GHSA-gv75-j3v8-3crm) the plugin refuses an
// unverified answer itself, but with its generic `FAILED_TO_VERIFY_REGISTRATION` or `AUTHENTICATION_FAILED`, so
// the sign-in and settings pages couldn't say what to do (DS-93). Reading the flag first keeps that explanation.

import {
  decodeAttestationObject,
  isoBase64URL,
  parseAuthenticatorData,
} from "@simplewebauthn/server/helpers";

/**
 * The UV flag of a credential as the passkey endpoints receive it (`body.response`): its registration's
 * `attestationObject` or its authentication's `authenticatorData`. Undefined when the answer can't be read; the
 * plugin then refuses or accepts it on its own.
 */
export function userVerifiedIn(credential: unknown): boolean | undefined {
  if (typeof credential !== "object" || credential === null || !("response" in credential)) {
    return undefined;
  }
  const { response } = credential;
  if (typeof response !== "object" || response === null) return undefined;
  try {
    if ("authenticatorData" in response && typeof response.authenticatorData === "string") {
      return parseAuthenticatorData(isoBase64URL.toBuffer(response.authenticatorData)).flags.uv;
    }
    if ("attestationObject" in response && typeof response.attestationObject === "string") {
      const authData = decodeAttestationObject(
        isoBase64URL.toBuffer(response.attestationObject),
      ).get("authData");
      return parseAuthenticatorData(authData).flags.uv;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
