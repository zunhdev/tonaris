// Better Auth's OAuth 2.1 authorization server for MCP (TS-61): signing keys, registered clients, the protected
// resource, consents (an MCP connection is one consent, TS-30) and tokens. Better Auth reads and writes them
// through its Drizzle adapter (`@better-auth/mcp` over `@better-auth/oauth-provider`, plus `jwt()`).
// Client ids are text: a CIMD client's id is the URL of its metadata document, and a DCR client's is random.

import { boolean, index, integer, jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { sessions, users } from "./auth";
import { instant, table, timestamps } from "./columns";

/** The JWT plugin's signing keys; the private key is stored encrypted with the auth secret. */
export const jwks = table("jwks", {
  id: uuid().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  alg: text(),
  crv: text(),
  expiresAt: instant(),
  ...timestamps,
});

/**
 * OAuth clients: one per Client ID Metadata Document (refreshed from it) or dynamic registration. `metadata`
 * and the other optional columns are what the client declared.
 */
export const oauthClients = table(
  "oauth_client",
  {
    id: uuid().primaryKey(),
    clientId: text().notNull().unique(),
    clientSecret: text(),
    clientDiscoveryId: text(),
    disabled: boolean().default(false),
    skipConsent: boolean(),
    enableEndSession: boolean(),
    subjectType: text(),
    scopes: text().array(),
    clientCredentialsScopes: text().array().default([]),
    // The user who registered it while signed in; MCP clients register unauthenticated, so it stays empty.
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    name: text(),
    uri: text(),
    icon: text(),
    contacts: text().array(),
    tos: text(),
    policy: text(),
    softwareId: text(),
    softwareVersion: text(),
    softwareStatement: text(),
    redirectUris: text().array().notNull(),
    postLogoutRedirectUris: text().array(),
    backchannelLogoutUri: text(),
    backchannelLogoutSessionRequired: boolean(),
    tokenEndpointAuthMethod: text(),
    applicationType: text(),
    jwks: text(),
    jwksUri: text(),
    grantTypes: text().array(),
    responseTypes: text().array(),
    // Better Auth's field name, which snake-casing would spell require_p_k_c_e.
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean().default(false),
    referenceId: text(),
    metadata: jsonb(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/** Protected resources tokens are issued for (RFC 8707): `/mcp` only, seeded at start-up. */
export const oauthResources = table("oauth_resource", {
  id: uuid().primaryKey(),
  identifier: text().notNull().unique(),
  name: text().notNull(),
  accessTokenTtl: integer(),
  refreshTokenTtl: integer(),
  signingAlgorithm: text(),
  signingKeyId: text(),
  allowedScopes: text().array(),
  customClaims: jsonb(),
  dpopBoundAccessTokensRequired: boolean().default(false),
  disabled: boolean().default(false),
  policyVersion: integer().default(1),
  metadata: jsonb(),
  ...timestamps,
});

/** Which clients may ask for which resources. */
export const oauthClientResources = table(
  "oauth_client_resource",
  {
    id: uuid().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text()
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: "cascade" }),
    metadata: jsonb(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.clientId, t.resourceId), index().on(t.resourceId)],
);

/**
 * A person's consent to a client: an MCP connection (TS-30, FR-10.3). Its scopes carry the mode chosen on the
 * consent page, and revoking the connection deletes it with its tokens.
 */
export const oauthConsents = table(
  "oauth_consent",
  {
    id: uuid().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    referenceId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    // Tonaris's own column, which Better Auth never writes: the last MCP call through the connection, to the minute
    // (DS-86, TON-80). Null until the first.
    lastUsedAt: instant(),
    ...timestamps,
  },
  (t) => [index().on(t.userId), index().on(t.clientId)],
);

/** Rotating refresh tokens, stored hashed (TS-61: 30 days, reuse revokes the grant). */
export const oauthRefreshTokens = table(
  "oauth_refresh_token",
  {
    id: uuid().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    expiresAt: instant().notNull(),
    revoked: instant(),
    rotatedAt: instant(),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: instant(),
    authTime: instant(),
    confirmation: jsonb(),
    ...timestamps,
  },
  (t) => [
    index().on(t.clientId),
    index().on(t.sessionId),
    index().on(t.userId),
    index().on(t.authorizationCodeId),
  ],
);

/**
 * Opaque access tokens, issued only without a resource. MCP tokens are JWTs bound to `/mcp` and never stored;
 * the table exists because Better Auth requires it.
 */
export const oauthAccessTokens = table(
  "oauth_access_token",
  {
    id: uuid().primaryKey(),
    token: text().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    refreshId: uuid().references(() => oauthRefreshTokens.id, { onDelete: "cascade" }),
    scopes: text().array().notNull(),
    expiresAt: instant().notNull(),
    revoked: instant(),
    confirmation: jsonb(),
    ...timestamps,
  },
  (t) => [
    index().on(t.clientId),
    index().on(t.sessionId),
    index().on(t.userId),
    index().on(t.authorizationCodeId),
    index().on(t.refreshId),
  ],
);

/**
 * Used `private_key_jwt` client assertions (ChatGPT authenticates this way), so none is accepted twice. The id
 * is Better Auth's digest of the assertion, not a UUID.
 */
export const oauthClientAssertions = table("oauth_client_assertion", {
  id: text().primaryKey(),
  expiresAt: instant().notNull(),
  ...timestamps,
});
