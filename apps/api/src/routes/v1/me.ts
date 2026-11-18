// GET /v1/me: the signed-in account (FR-11.1). Clients call it to learn who is signed in, and whether they agreed to
// the current terms of use and privacy notice; POST /v1/me/terms records that they did (TON-131). GET /v1/me/favorites
// lists their favorite albums for Settings → Profile (FR-11.16, TON-297).

import { Elysia } from "elysia";

import { agreeToTerms, favoritesOf, type Database } from "@tonaris/db";
import {
  accountSchema,
  ownFavoritesSchema,
  problemSchema,
  termsAgreementSchema,
  termsVersion,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { presentFavorites, type ArtworkSigner } from "../../img/artwork";
import { ProblemError } from "../../problem";

export function meRoutes(
  session: SessionGuard,
  { db, artwork }: { db: Database; artwork: ArtworkSigner },
) {
  return new Elysia()
    .use(session)
    .get(
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
    )
    .get(
      "/me/favorites",
      {
        signedIn: true,
        response: { 200: ownFavoritesSchema, 401: problemSchema },
        detail: {
          summary: "List the person's favorite albums",
          description:
            "Their favorite albums in order (FR-11.16), each with its title, artist and signed artwork, those in Trash marked: hidden from their people until restored. `account.setFavorites` changes them, in the app only (X-03).",
          tags: ["accounts"],
          operationId: "listOwnFavorites",
        },
      },
      async ({ account }) => ({
        favorites: presentFavorites(artwork, await favoritesOf(db, account.id)),
      }),
    )
    .post(
      "/me/terms",
      {
        signedIn: true,
        body: termsAgreementSchema,
        response: { 200: accountSchema, 401: problemSchema, 422: problemSchema },
        detail: {
          summary: "Agree to the terms of use and privacy notice",
          description:
            "Records that the person agreed to the version of `/terms` and `/privacy` they were shown. 422 `validation_failed` when that isn't the current version: the texts changed, so the person reads them again.",
          tags: ["accounts"],
          operationId: "agreeToTerms",
        },
      },
      async ({ account, body }) => {
        if (body.version !== termsVersion) {
          throw new ProblemError(
            422,
            "validation_failed",
            "The terms changed since this page loaded. Reload to read them.",
          );
        }
        await agreeToTerms(db, { userId: account.id }, termsVersion);
        return { ...account, termsAgreed: true };
      },
    );
}
