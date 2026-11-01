// Whether a request carries Tonaris's session cookie (TON-155): `__Secure-tonaris.session_token`, or
// `tonaris.session_token` where cookies aren't secure (apps/api's auth.ts, TS-08). Only its name is read: the API
// decides who is signed in, and the workspace sends a signed-out `/` to the landing page itself.

const sessionCookie = /(?:^|;)\s*(?:__Secure-)?tonaris\.session_token=[^;\s]/;

/** True when the `Cookie` header names a session cookie with a value. */
export function hasSessionCookie(cookies: string | null): boolean {
  return cookies !== null && sessionCookie.test(cookies);
}
