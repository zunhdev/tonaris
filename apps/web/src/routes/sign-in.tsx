// Sign-in (DS-90): a public page, rendered on the server (TS-03). TON-9 adds the email-code form.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in · Tonaris" }] }),
  component: SignIn,
});

function SignIn() {
  return (
    <main
      aria-labelledby="sign-in-title"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6"
    >
      <p className="text-title text-fg-primary">Tonaris</p>
      <div className="flex w-full max-w-sm flex-col gap-2 rounded-xl border border-subtle bg-panel p-6">
        <h1 id="sign-in-title" className="text-title text-fg-primary">
          Sign in
        </h1>
        <p className="text-fg-secondary">Sign-in isn't available yet.</p>
      </div>
    </main>
  );
}
