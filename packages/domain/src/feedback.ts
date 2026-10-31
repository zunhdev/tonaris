// The feedback board (FR-11.15, TON-144): a Fider site that signs people in through Tonaris's authorization server.
// Fider names a custom sign-in provider with a key such as `_k3j9x0q2ab`, which its callback URL carries. The web
// app opens the board through Fider's sign-in route for that provider, so a person signed in to Tonaris arrives
// signed in to the board.

const callbackPath = /^\/oauth\/(_[a-z0-9]+)\/callback$/;

/**
 * The provider key in a Fider callback URL, `https://login.fider.io/oauth/{key}/callback` on Fider Cloud; undefined
 * when `callbackUrl` isn't one.
 */
export function feedbackProviderKey(callbackUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return undefined;
  }
  if (url.search || url.hash) return undefined;
  return callbackPath.exec(url.pathname)?.[1];
}

/**
 * Where the account menu opens the board: Fider's sign-in route for Tonaris's provider, which returns to the board's
 * front page. Fider takes that as a full URL on the board's own origin and answers 403 for a bare path (TON-145).
 * Undefined unless both the board's address and the callback URL are set and valid.
 */
export function feedbackSignInUrl(
  boardUrl: string | undefined,
  callbackUrl: string | undefined,
): string | undefined {
  if (!boardUrl || !callbackUrl) return undefined;
  const key = feedbackProviderKey(callbackUrl);
  let board: URL;
  try {
    board = new URL(boardUrl);
  } catch {
    return undefined;
  }
  if (!key || (board.protocol !== "https:" && board.protocol !== "http:")) return undefined;
  return `${board.origin}/oauth/${key}?redirect=${encodeURIComponent(`${board.origin}/`)}`;
}
