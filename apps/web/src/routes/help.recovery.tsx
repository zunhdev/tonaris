// `/help/recovery` (DS-93, FR-11.5, TS-73): what to do after losing access to the sign-in email. The creator moves
// the account to a new address once they are satisfied it's the person's, so the page says whom to write to, from
// the API's `SUPPORT_EMAIL`. Public and server-rendered: whoever needs it can't sign in. There is no request form.

import { createApiClient } from "@/api";
import { serverApiUrl } from "@/config";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/help/recovery")({
  head: () => ({ meta: [{ title: "Lost access to your email · Tonaris" }] }),
  loader: async () => {
    try {
      const { data } = await createApiClient(serverApiUrl).v1.support.get();
      return { support: data?.email };
    } catch {
      return { support: undefined };
    }
  },
  component: RecoveryHelp,
});

function RecoveryHelp() {
  const { support } = Route.useLoaderData();
  return (
    <SignInCard home>
      <h1 id={signInTitleId} className="text-title text-fg-primary">
        Lost access to your email?
      </h1>
      <p className="text-fg-secondary">
        If you can't get email at your sign-in address any more, the Tonaris creator can move your
        account to a new address. Your collection, sharing and settings stay as they are.
      </p>
      {support ? (
        <p className="[overflow-wrap:anywhere] text-fg-primary">
          Write to{" "}
          <a href={`mailto:${support}`} className="text-accent-solid underline underline-offset-4">
            {support}
          </a>{" "}
          from the address you use now. Say which address you signed in with, and anything that
          shows the account is yours.
        </p>
      ) : (
        <p className="text-status-danger">
          Couldn't load the support address. Reload the page to try again.
        </p>
      )}
      <p className="text-fg-secondary">
        Once the creator is sure, Tonaris emails your new address a link. Open it to confirm, then
        sign in with the new address. A deleted account can't be recovered.
      </p>
      <Link to="/sign-in" className="text-accent-solid underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </SignInCard>
  );
}
