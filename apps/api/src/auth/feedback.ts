// Sign in with Tonaris on the feedback board (FR-11.15, TON-144). Fider, at feedback.tonaris.app, is a client of
// Tonaris's authorization server (TS-61): a first-party, confidential client that skips consent and sends no PKCE
// verifier, written at start-up from FEEDBACK_CALLBACK_URL and FEEDBACK_CLIENT_SECRET. It may ask only for the
// person's ID, name and email, which it reads from the userinfo endpoint; its tokens open neither `/mcp` nor `/v1`.

import { APIError } from "better-auth/api";
import type { JWTPayload } from "jose";

import { type Database, disableFirstPartyClient, saveFirstPartyClient } from "@tonaris/db";

import type { ApiConfig } from "../config";

export const feedbackClientId = "feedback-board";

/**
 * All the board may ask for, which no AI client is ever given: `openid` and `email`. The name comes from Tonaris's
 * own claim (`feedbackUserInfoClaims`), not `profile`, whose claims Better Auth derives from a name a person may
 * not have, and splits into given and family names.
 */
export const feedbackScopes = ["openid", "email"] as const;

/** The board's name for someone without a display name, so it never shows the start of their email instead. */
export const feedbackFallbackName = "Tonaris member";

/** Better Auth's client-secret hash: SHA-256, base64url without padding. */
export function clientSecretHash(secret: string): string {
  return new Bun.CryptoHasher("sha256").update(secret).digest("base64url");
}

/** Writes the board's client from the configuration, or disables it when the configuration has none. */
export async function syncFeedbackClient(
  db: Database,
  feedback: ApiConfig["feedback"],
): Promise<void> {
  if (!feedback) {
    await disableFirstPartyClient(db, feedbackClientId);
    return;
  }
  await saveFirstPartyClient(db, {
    clientId: feedbackClientId,
    name: "Tonaris feedback board",
    secretHash: clientSecretHash(feedback.clientSecret),
    redirectUri: feedback.callbackUrl,
    scopes: feedbackScopes,
  });
}

/**
 * The userinfo claims Tonaris adds (`customUserInfoClaims`): only the board's tokens may read them, and its `name`
 * is the display name or the fallback. Better Auth already refuses tokens without `openid`, which only the board's
 * client can be granted.
 */
export function feedbackUserInfoClaims({
  user,
  jwt,
}: {
  user: { name?: string | null };
  jwt: JWTPayload;
}): Record<string, unknown> {
  if ((jwt.client_id ?? jwt.azp) !== feedbackClientId) {
    throw new APIError("UNAUTHORIZED", {
      error: "invalid_token",
      error_description: "This token can't read the person's profile.",
    });
  }
  return { name: user.name?.trim() || feedbackFallbackName };
}
