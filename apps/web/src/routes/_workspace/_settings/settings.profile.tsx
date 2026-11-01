// Settings → Profile (DS-93, FR-11.3): the display name, which people the person shares with see instead of their
// email. It is saved when the field loses focus, or on Enter. Clearing it removes it while they share nothing;
// while they share, the server refuses (AC-38), and the field goes back to the saved name with the reason.

import { forgetAccount } from "@/features/account/session";
import { useSend } from "@/features/sharing/send";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";

import { maxNameLength } from "@tonaris/domain";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

export const Route = createFileRoute("/_workspace/_settings/settings/profile")({
  staticData: { title: "Profile" },
  head: () => ({ meta: [{ title: "Profile · Tonaris" }] }),
  component: Profile,
});

function Profile() {
  const { account } = Route.useRouteContext();
  const router = useRouter();
  const id = useId();
  const savedName = account.displayName ?? "";
  const [name, setName] = useState(savedName);
  const { run, busy, error, setError } = useSend();
  const [saved, setSaved] = useState(false);

  async function save() {
    if (busy || name.trim() === savedName) return;
    setSaved(false);
    if (await run({ name: "account.setDisplayName", args: { displayName: name } })) {
      setName(savedName);
      return;
    }
    setSaved(true);
    // The account menu shows the new name at once.
    forgetAccount();
    await router.invalidate();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-6">
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Display name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={maxNameLength}
          autoComplete="nickname"
          className="max-w-sm"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
            setSaved(false);
          }}
          onBlur={() => void save()}
        />
        <p id={`${id}-hint`} className="text-small text-fg-secondary">
          People you share with see this name instead of your email. It's optional until you share.
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-small text-status-danger">
            {error}
          </p>
        )}
        <output className="text-small text-fg-secondary empty:hidden">
          {saved ? "Saved." : ""}
        </output>
      </form>
    </div>
  );
}
