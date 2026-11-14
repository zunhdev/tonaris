// Settings → Account (DS-93, FR-11.4): the sign-in email and changing it, the passkeys, and the Danger zone
// (features/settings/account.tsx). A change in progress resumes at its step.

import { api } from "@/api";
import { loadOrThrow } from "@/common/page-error";
import { AccountSettings } from "@/features/settings/account";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_settings/settings/account")({
  staticData: { title: "Account" },
  head: () => ({ meta: [{ title: "Account · Tonaris" }] }),
  loader: async () => {
    const [change, passkeys] = await Promise.all([
      api.v1.account["email-change"].get(),
      api.v1.account.passkeys.get(),
    ]);
    return {
      change: loadOrThrow(change, "the email change").change,
      passkeys: loadOrThrow(passkeys, "the passkeys"),
    };
  },
  component: AccountPage,
});

function AccountPage() {
  const { account } = Route.useRouteContext();
  const { change, passkeys } = Route.useLoaderData();
  return <AccountSettings account={account} change={change} passkeys={passkeys} />;
}
