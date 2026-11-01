// `/oauth/consent` (DS-85): an AI client asks for access to the collection, and the person picks the
// connection's mode, Read-only preselected, or cancels (FR-10.3). The API's authorization server sends people
// here with a signed request; the decision goes back to it, and the browser follows to the client.

import { currentAccount } from "@/features/account/session";
import { SignInCard, signInTitleId } from "@/features/account/sign-in-card";
import { modeText } from "@/features/connections/modes";
import { availableModes, clientName, consentRequest, decide } from "@/features/connections/oauth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";

import type { McpMode } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";

export const Route = createFileRoute("/oauth/consent")({
  // The request lives in this page's query and is answered with the session cookie, from the browser.
  ssr: false,
  head: () => ({ meta: [{ title: "Connect an AI client · Tonaris" }] }),
  beforeLoad: async ({ location }) => {
    const account = await currentAccount();
    if (!account) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    return { account };
  },
  component: Consent,
});

function Consent() {
  const { account } = Route.useRouteContext();
  const search = window.location.search;
  const [request] = useState(() => consentRequest(search));
  const [name, setName] = useState<string>();
  const [mode, setMode] = useState<McpMode>("read_only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const offered = availableModes(request.scopes);

  useEffect(() => {
    void clientName(request.clientId).then(setName);
  }, [request.clientId]);

  async function answer(choice: McpMode | "cancel") {
    setBusy(true);
    setError(undefined);
    const result = await decide({ search, scopes: request.scopes, mode: choice });
    if (!result.ok) {
      setBusy(false);
      setError(
        "This request has expired or was already answered. Start connecting again from the client.",
      );
      return;
    }
    window.location.assign(result.url);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void answer(mode);
  }

  const client = name ?? request.clientDomain ?? request.redirectHost ?? "An AI client";
  const returnsElsewhere = request.redirectHost && request.redirectHost !== request.clientDomain;
  return (
    <SignInCard>
      <div className="flex flex-col gap-1">
        <h1 id={signInTitleId} className="text-title text-fg-primary">
          {client} wants access to your Tonaris collection
        </h1>
        <p className="text-small text-fg-secondary">
          {name && "Name as provided by the client. "}
          {request.clientDomain && <>From {request.clientDomain}. </>}
          {returnsElsewhere && <>Returns to {request.redirectHost}.</>}
        </p>
      </div>
      <p className="text-fg-secondary">
        Signed in as <span className="text-fg-primary">{account.email}</span>
      </p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {offered.length === 0 ? (
          <p role="alert" className="text-status-danger">
            This client didn't ask for access to your collection, so there is nothing to grant.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-fg-primary">Access</legend>
            {offered.map((value) => (
              <label
                key={value}
                className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg border border-subtle bg-raised p-3 has-checked:border-strong has-checked:bg-selected"
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="row-span-2 mt-0.5 accent-accent-fill"
                />
                <span className="text-fg-primary">{modeText[value].title}</span>
                <span className="col-start-2 text-small text-fg-secondary">
                  {modeText[value].description}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="text-status-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" size="lg" disabled={busy} onClick={() => void answer("cancel")}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={busy || offered.length === 0}>
            Connect
          </Button>
        </div>
      </form>
    </SignInCard>
  );
}
