// `/oauth/authorize` (TS-61): where sign-in lands when it began at an AI client's authorization request. It hands
// the request back to the API's authorization server, which now finds a session and asks for consent (DS-85).

import { authorizeUrl } from "@/features/connections/oauth";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/oauth/authorize")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: authorizeUrl(location.searchStr), reloadDocument: true });
  },
});
