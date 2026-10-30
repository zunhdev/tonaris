// Sign-in (DS-90): public pages, rendered on the server (TS-03). `/sign-in` asks for the email and
// `/sign-in/verify` for the emailed code, both inside the same card, beside what Tonaris is (TON-116).

import { SignInCard } from "@/features/account/sign-in-card";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in · Tonaris" }] }),
  component: () => (
    <SignInCard promo>
      <Outlet />
    </SignInCard>
  ),
});
