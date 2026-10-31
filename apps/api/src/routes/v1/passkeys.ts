// Settings → Account's passkeys (FR-11.1, DS-93, TON-143): listing, renaming and removing them. Adding one and
// signing in with one are Better Auth's ceremonies under /auth, which is where browsers' WebAuthn calls go. App-only
// (X-03): the routes take the session cookie, and MCP tokens never reach /v1 (TS-62). A removal stops the passkey
// signing in at once and is recorded in the ledger (TS-113).

import { Elysia } from "elysia";
import { z } from "zod";

import {
  listPasskeys,
  type PasskeyRow,
  removePasskey,
  renamePasskey,
  type Database,
} from "@tonaris/db";
import {
  authorizeWrite,
  defaultPasskeyName,
  type Passkey,
  passkeyName,
  passkeyRefusalDetails as refusals,
  passkeyRenameSchema,
  passkeySchema,
  type Principal,
  problemSchema,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

function authorize(principal: Principal, ownerId: string): void {
  const decision = authorizeWrite(principal, { ownerId, scope: "account" });
  if (!decision.allowed) {
    throw new ProblemError(403, "permission_denied", "Your passkeys are managed in the app.");
  }
}

const none = () => new ProblemError(404, "not_found", refusals.none);

function passkeyOf(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    name: row.name ?? defaultPasskeyName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function passkeyRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .get(
      "/account/passkeys",
      {
        signedIn: true,
        response: { 200: z.array(passkeySchema), 401: problemSchema },
        detail: {
          summary: "List passkeys",
          description: "The passkeys that sign in to this account, newest first (FR-11.1).",
          tags: ["accounts"],
          operationId: "listPasskeys",
        },
      },
      async ({ account }) => (await listPasskeys(db, account.id)).map(passkeyOf),
    )
    .patch(
      "/account/passkeys/:id",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        body: passkeyRenameSchema,
        response: {
          200: passkeySchema,
          401: problemSchema,
          403: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Rename a passkey",
          description: "Refused for a blank name, or one longer than other names may be.",
          tags: ["accounts"],
          operationId: "renamePasskey",
        },
      },
      async ({ principal, account, params, body }) => {
        authorize(principal, account.id);
        const named = passkeyName(body.name);
        if (!named.ok) throw new ProblemError(422, "validation_failed", refusals[named.refusal]);
        const renamed = await renamePasskey(db, {
          userId: account.id,
          id: params.id,
          name: named.name,
        });
        if (!renamed) throw none();
        return passkeyOf(renamed);
      },
    )
    .delete(
      "/account/passkeys/:id",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        response: {
          // Elysia sends a 204 without a body, so validation sees undefined; the document shows no content.
          204: z.null().optional().meta({ description: "The passkey is removed." }),
          401: problemSchema,
          403: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Remove a passkey",
          description:
            "It stops signing in at once. Email codes keep working, and the passkey can be added again.",
          tags: ["accounts"],
          operationId: "removePasskey",
        },
      },
      async ({ principal, account, params, status }) => {
        authorize(principal, account.id);
        if (!(await removePasskey(db, { userId: account.id, id: params.id }))) throw none();
        return status(204, null);
      },
    );
}
