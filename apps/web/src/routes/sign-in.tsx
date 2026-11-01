// Sign-in (DS-90): public pages, rendered on the server (TS-03). `/sign-in` asks for the email and
// `/sign-in/verify` for the emailed code, both inside the same card. What Tonaris is, beside the card since TON-116,
// is the landing page's now, which the wordmark leads to (TON-155).

import { SignInCard } from "@/features/account/sign-in-card";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in · Tonaris" }] }),
  component: () => (
    <SignInCard home>
      <Outlet />
    </SignInCard>
  ),
});
