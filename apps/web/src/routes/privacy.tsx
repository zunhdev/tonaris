// `/privacy` (TON-131): the privacy notice, public and server-rendered (features/legal).

import { LegalPage, loadSupport } from "@/features/legal/legal-page";
import { PrivacyText } from "@/features/legal/texts";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy notice · Tonaris" }] }),
  loader: loadSupport,
  component: Privacy,
});

function Privacy() {
  const { support } = Route.useLoaderData();
  return (
    <LegalPage title="Privacy notice" other={{ to: "/terms", label: "Terms of use" }}>
      <PrivacyText support={support} />
    </LegalPage>
  );
}
