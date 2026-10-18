// GET /v1/me: the signed-in account (FR-11.1). Clients call it to learn who is signed in.

import { Elysia } from "elysia";

import { accountSchema, problemSchema } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";

export function meRoutes(session: SessionGuard) {
  return new Elysia().use(session).get(
    "/me",
    {
      signedIn: true,
      response: { 200: accountSchema, 401: problemSchema },
      detail: {
        summary: "Get the signed-in account",
        tags: ["accounts"],
        operationId: "getMe",
      },
    },
    ({ account }) => account,
  );
}
