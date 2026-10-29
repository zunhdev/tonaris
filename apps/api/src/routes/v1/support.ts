// GET /v1/support: where people write for help (TS-73), such as recovering a lost sign-in address. Public, since
// those who need it can't sign in; `/help/recovery` shows it.

import { Elysia } from "elysia";

import { supportSchema } from "@tonaris/domain";

export function supportRoutes({ supportEmail }: { supportEmail: string }) {
  return new Elysia().get(
    "/support",
    {
      response: supportSchema,
      detail: {
        summary: "Get the support address",
        description: "The address the help pages show (`SUPPORT_EMAIL`).",
        tags: ["system"],
        operationId: "getSupport",
      },
    },
    () => ({ email: supportEmail }),
  );
}
