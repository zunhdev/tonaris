// `/terms` (TON-131): the terms of use, public and server-rendered (features/legal).

import { LegalPage, loadSupport } from "@/features/legal/legal-page";
import { TermsText } from "@/features/legal/texts";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of use · Tonaris" }] }),
  loader: loadSupport,
  component: Terms,
});

function Terms() {
  const { support } = Route.useLoaderData();
  return (
    <LegalPage title="Terms of use" other={{ to: "/privacy", label: "Privacy notice" }}>
      <TermsText support={support} />
    </LegalPage>
  );
}
