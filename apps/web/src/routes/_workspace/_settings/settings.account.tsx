// Settings → Account (DS-93, FR-11.4): the sign-in email and changing it, the passkeys, and the Danger zone
// (features/settings/account.tsx). A change in progress resumes at its step.

import { api } from "@/api";
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
    if (!change.data) throw new Error(`Couldn't load the email change (HTTP ${change.status}).`);
    if (!passkeys.data) throw new Error(`Couldn't load the passkeys (HTTP ${passkeys.status}).`);
    return { change: change.data.change, passkeys: passkeys.data };
  },
  component: AccountPage,
});

function AccountPage() {
  const { account } = Route.useRouteContext();
  const { change, passkeys } = Route.useLoaderData();
  return <AccountSettings account={account} change={change} passkeys={passkeys} />;
}
