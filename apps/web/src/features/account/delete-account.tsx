// Settings → Account's Danger zone (DS-97, FR-11.10): **Delete account** opens a dialog that lists every
// consequence; typing the sign-in email enables **Delete account permanently**. Confirming clears what this
// browser keeps for the account, as signing out does, and moves to `/account-deleted`, outside the workspace,
// which follows the deletion. The creator's account can't be deleted. "Download your data first" joins with the
// export (TON-89).

import { api, refusalOf } from "@/api";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useRouter } from "@tanstack/react-router";
import { useId, useState } from "react";

import { type Account, emailKey } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

import { rememberDeletion } from "./pending-deletion";
import { forgetSignIn } from "./pending-sign-in";
import { forgetAccount } from "./session";

/** What deleting does (FR-11.10), as the dialog lists it. */
const consequences = [
  "Your whole collection is removed permanently, including Unsorted and Trash.",
  "Your settings, and the shares saved to Shared with me, are removed.",
  "Everything you share becomes unavailable to everyone, including people with a link.",
  "Your AI connections are disconnected.",
  "It can't be undone: nothing goes to Trash, and the account can't be recovered.",
];

export function DangerZone({ account }: { account: Account }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 border-t border-subtle pt-6"
    >
      <h2 id={`${id}-title`} className="text-title text-fg-primary">
        Danger zone
      </h2>
      {account.role === "creator" ? (
        <p className="text-fg-secondary">
          The creator's account can't be deleted: it runs admissions.
        </p>
      ) : (
        <>
          <p className="text-fg-secondary">
            Deleting your account removes it and everything in it, for good.
          </p>
          <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        </>
      )}
      {open && <DeleteAccountDialog account={account} onClose={() => setOpen(false)} />}
    </section>
  );
}

function DeleteAccountDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const id = useId();
  const router = useRouter();
  const sync = useSyncClient();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const matches = emailKey(typed) === account.email;

  async function remove() {
    setBusy(true);
    setError(undefined);
    try {
      const { data, error: failed } = await api.v1.account.deletion.post({ email: typed });
      if (!data) {
        setError(refusalOf(failed, "Couldn't delete your account. Try again."));
        setBusy(false);
        return;
      }
      rememberDeletion(data.token);
      // What this browser keeps for the account goes, as on signing out.
      await sync?.clear();
      forgetAccount();
      forgetSignIn();
      await router.navigate({ to: "/account-deleted" });
    } catch {
      setError("Couldn't reach Tonaris. Try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>Deleting your account means:</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-fg-primary">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-email`}>Type {account.email} to confirm</Label>
          <Input
            id={`${id}-email`}
            autoComplete="off"
            spellCheck={false}
            value={typed}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(undefined);
            }}
          />
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-small text-status-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!matches || busy} onClick={() => void remove()}>
            Delete account permanently
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
