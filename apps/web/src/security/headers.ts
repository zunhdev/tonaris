// The web app's security headers (TS-101). Every response gets them; the CSP's nonce is fresh per request, and
// Start puts it on the scripts and styles it renders, so nothing inline runs without it.

/** 128 random bits, base64: the per-request CSP nonce. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCodePoint(...bytes));
}

/**
 * The Content-Security-Policy (TS-101). Scripts and `<style>` elements need the nonce; images, fonts and API
 * calls come from this origin or the API's (artwork goes through the API's `/img`, TS-103). Nothing may frame
 * the app, and `<base>`, plugins and foreign form targets are refused.
 */
export function contentSecurityPolicy({ nonce, apiOrigin }: { nonce: string; apiOrigin: string }) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: ${apiOrigin}`,
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders({
  nonce,
  apiOrigin,
  pathname,
}: {
  nonce: string;
  apiOrigin: string;
  pathname: string;
}): Record<string, string> {
  return {
    "content-security-policy": contentSecurityPolicy({ nonce, apiOrigin }),
    // One year, subdomains included (the API's too); browsers ignore it over plain HTTP.
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    // Guest share and invitation URLs carry their token, so they never leak in a Referer (TS-32, TS-71).
    "referrer-policy":
      pathname === "/s" || pathname.startsWith("/s/") || pathname.startsWith("/join/")
        ? "no-referrer"
        : "strict-origin-when-cross-origin",
  };
}
