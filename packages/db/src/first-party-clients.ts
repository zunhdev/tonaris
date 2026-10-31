// OAuth clients Tonaris registers itself, such as the feedback board's (FR-11.15, TON-144). Each is a confidential
// client whose row the API writes at start-up from its configuration, unlike AI clients, which register or are
// discovered (TS-61). Its secret is stored as the hash Better Auth compares.

import { eq } from "drizzle-orm";

import { uuidv7 } from "@tonaris/domain";

import type { Database } from "./client";
import { oauthClients } from "./schema";

export type FirstPartyClient = {
  clientId: string;
  name: string;
  /** The hash of the secret, as Better Auth stores client secrets. */
  secretHash: string;
  redirectUri: string;
  scopes: readonly string[];
};

/**
 * Writes `client` as an enabled, confidential client that skips consent and is allowed without PKCE, since it
 * belongs to Tonaris and its app sends no verifier. A changed secret or redirect replaces the old one.
 */
export async function saveFirstPartyClient(db: Database, client: FirstPartyClient): Promise<void> {
  const fields = {
    clientSecret: client.secretHash,
    name: client.name,
    redirectUris: [client.redirectUri],
    scopes: [...client.scopes],
    disabled: false,
    skipConsent: true,
    requirePKCE: false,
    tokenEndpointAuthMethod: "client_secret_basic",
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    applicationType: "web",
  };
  await db
    .insert(oauthClients)
    .values({ id: uuidv7(), clientId: client.clientId, ...fields })
    .onConflictDoUpdate({ target: oauthClients.clientId, set: fields });
}

/** Turns `clientId` off, if it exists: its sign-ins and tokens stop working until it is saved again. */
export async function disableFirstPartyClient(db: Database, clientId: string): Promise<void> {
  await db.update(oauthClients).set({ disabled: true }).where(eq(oauthClients.clientId, clientId));
}
