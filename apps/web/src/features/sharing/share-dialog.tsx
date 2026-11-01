// The sharing dialog (DS-65; FR-07.1–FR-07.4, FR-07.14, FR-11.3), the owner's, on the desktop: disclosures always at
// the top, so they are read before anything is shared; invitations by email, each with its status; access from
// folders above, read-only, each opening its own dialog; and the link switch, with the link to copy and an inline
// confirmation before turning it off, for good. Without a display name, a field to add one replaces Invite and the
// switch. Sharing is online-only: the dialog sends its mutations straight to the API and reloads what it shows after
// each, with no outbox, and waits while offline (DS-81).

import { api } from "@/api";
import { useCollectionUi } from "@/features/collection/collection-ui";
import { useCollectionData } from "@/features/collection/data";
import { unreachable, useSend, type Unsent } from "@/features/sharing/send";
import { count } from "@/features/shell/words";
import { useConnection } from "@/features/sync/sync-provider";
import { Check, Copy, Ellipsis, Folder } from "lucide-react";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";

import { maxNameLength, uuidv7, type ShareSettings } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@tonaris/ui/components/dropdown-menu";
import { Field } from "@tonaris/ui/components/field";
import { Input } from "@tonaris/ui/components/input";
import { Switch } from "@tonaris/ui/components/switch";

export function ShareDialog() {
  const { sharing, endShare } = useCollectionUi();
  const { tree } = useCollectionData();
  const container = sharing === undefined ? undefined : tree.byId.get(sharing);
  return (
    <Dialog open={container !== undefined} onOpenChange={(open) => !open && endShare()}>
      {container && (
        <DialogContent className="max-w-[560px]">
          <ShareBody
            key={container.id}
            id={container.id}
            name={container.name}
            kind={container.kind}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ShareBody({ id, name, kind }: { id: string; name: string; kind: "folder" | "list" }) {
  const { startShare } = useCollectionUi();
  const offline = useConnection() === "offline";
  // Read when opened, and again after each change; what was shown stays until the new read arrives.
  const [loaded, setLoaded] = useState<{ settings?: ShareSettings; failed: boolean }>({
    failed: false,
  });
  const read = useCallback(
    (isCurrent: () => boolean = () => true) => {
      const once = (): Promise<ShareSettings | undefined> =>
        api.v1
          .containers({ id })
          .sharing.get()
          .then(
            ({ data }) => {
              if (!isCurrent()) return data ?? undefined;
              setLoaded((previous) =>
                data ? { settings: data, failed: false } : { ...previous, failed: true },
              );
              // An email still going out is read again shortly, so "sending…" settles (FR-07.5).
              if (data?.invitations.some((each) => each.emailStatus === "sending")) {
                setTimeout(() => {
                  if (isCurrent()) void once();
                }, 1500);
              }
              return data ?? undefined;
            },
            () => {
              if (isCurrent()) setLoaded((previous) => ({ ...previous, failed: true }));
              return undefined;
            },
          );
      return once();
    },
    [id],
  );
  useEffect(() => {
    let current = true;
    void read(() => current);
    return () => {
      current = false;
    };
  }, [read]);
  const load = useCallback(() => void read(), [read]);
  const { settings, failed } = loaded;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Share "{name}" · {kind}
        </DialogTitle>
        {/* Always shown first, before anything is shared (FR-07.14). */}
        <DialogDescription>
          Viewers see every custom field these albums use, including ones you add later.
          {kind === "folder" &&
            " Sharing a folder includes everything inside it, now and in the future."}
        </DialogDescription>
      </DialogHeader>
      {offline && (
        <p className="text-small text-status-warning">
          You're offline. Sharing waits until you're back.
        </p>
      )}
      {failed && (
        <p className="text-small text-status-danger">Couldn't load sharing. Close and try again.</p>
      )}
      {settings &&
        (settings.ownerDisplayName === null ? (
          <DisplayNameForm disabled={offline} onSaved={load} />
        ) : (
          <>
            <InviteForm containerId={id} disabled={offline} onInvited={load} />
            {settings.invitations.length > 0 && (
              <ul aria-label="People with access" className="flex flex-col gap-1">
                {settings.invitations.map((invitation) => (
                  <PersonRow
                    key={invitation.id}
                    invitation={invitation}
                    disabled={offline}
                    onChanged={load}
                  />
                ))}
              </ul>
            )}
            {settings.inherited.length > 0 && (
              <ul aria-label="Access from folders above" className="flex flex-col gap-1">
                {settings.inherited.map((above) => (
                  <li
                    key={above.containerId}
                    className="flex items-center gap-2 text-small text-fg-secondary"
                  >
                    <Folder strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />
                    <span>
                      Also visible through{" "}
                      <button
                        type="button"
                        className="text-fg-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
                        onClick={() => startShare(above.containerId)}
                      >
                        "{above.name}"
                      </button>
                      : {audienceOf(above)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <LinkSharing
              containerId={id}
              link={settings.link}
              disabled={offline}
              onChanged={load}
            />
          </>
        ))}
    </>
  );
}

/** A pending invitation's email, after "Pending" (DS-65, FR-07.5): reported apart from the invitation. */
function deliveryOf(status: ShareSettings["invitations"][number]["emailStatus"]): string {
  if (status === "sending") return " · sending…";
  if (status === "sent") return " · sent";
  if (status === "failed") return " · email failed";
  if (status === "unknown") return " · email not confirmed";
  return "";
}

/**
 * A person with access (DS-65): who, their invitation's status, Resend while its email didn't go, and their menu. A
 * write that didn't go through says why under the row; either way the dialog reads again.
 */
function PersonRow({
  invitation,
  disabled,
  onChanged,
}: {
  invitation: ShareSettings["invitations"][number];
  disabled: boolean;
  onChanged: () => void;
}) {
  const { run, busy, error } = useSend();
  const send = (mutation: Unsent) => void run(mutation).then(onChanged);
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3 text-base">
        <span className="min-w-0 flex-1 truncate">
          {invitation.displayName && (
            <span className="mr-2 text-fg-primary">{invitation.displayName}</span>
          )}
          <span className="text-fg-secondary">{invitation.email}</span>
        </span>
        <span className="text-small text-fg-secondary">
          {invitation.status === "accepted"
            ? "Accepted"
            : `Pending${deliveryOf(invitation.emailStatus)}`}
        </span>
        {invitation.status === "pending" &&
          (invitation.emailStatus === "failed" || invitation.emailStatus === "unknown") && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={() =>
                send({ name: "share.resendInvitation", args: { grantId: invitation.id } })
              }
            >
              Resend
            </Button>
          )}
        <RowMenu
          who={invitation.displayName ?? invitation.email}
          disabled={disabled}
          onRevoke={() => send({ name: "share.revoke", args: { grantId: invitation.id } })}
        />
      </div>
      {error !== undefined && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/** A person's menu (DS-65): Remove access, which revokes their invitation, pending or accepted (FR-07.15). */
function RowMenu({
  who,
  disabled,
  onRevoke,
}: {
  who: string;
  disabled: boolean;
  onRevoke: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More for ${who}`}
            disabled={disabled}
          />
        }
      >
        <Ellipsis strokeWidth={1.5} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" inDialog className="w-44">
        <DropdownMenuItem onClick={onRevoke}>Remove access</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "2 people · link", as DS-65 lists an ancestor's audience. */
function audienceOf({ people, link }: { people: number; link: boolean }): string {
  const parts = [
    ...(people > 0 ? [count(people, "person", "people")] : []),
    ...(link ? ["link"] : []),
  ];
  return parts.join(" · ");
}

/** Sharing needs a display name (FR-11.3): shown in place of Invite and the link switch until there is one. */
function DisplayNameForm({ disabled, onSaved }: { disabled: boolean; onSaved: () => void }) {
  const [name, setName] = useState("");
  const { run, busy, error, setError } = useSend();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    const reason = await run({ name: "account.setDisplayName", args: { displayName: name } });
    if (reason === undefined) onSaved();
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <Field
        label="Add a display name to share"
        hint="Viewers see this name instead of your email."
        problem={error}
      >
        {(control) => (
          <div className="flex gap-2">
            <Input
              {...control}
              value={name}
              maxLength={maxNameLength}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" disabled={disabled || busy}>
              Save
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}

/** Invite by email (FR-07.4): a refusal keeps the typed address, with the reason under it. */
function InviteForm({
  containerId,
  disabled,
  onInvited,
}: {
  containerId: string;
  disabled: boolean;
  onInvited: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const { run, busy, error, setError } = useSend();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() === "") return;
    const reason = await run({
      name: "share.invite",
      args: { grantId: uuidv7(), containerId, email },
    });
    if (reason === undefined) {
      setEmail("");
      onInvited();
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          type="email"
          aria-label="Invite by email"
          placeholder="Invite by email…"
          value={email}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(undefined);
          }}
        />
        <Button type="submit" disabled={disabled || busy}>
          Invite
        </Button>
      </div>
      {error !== undefined && (
        <p id={`${id}-error`} role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * The link switch (FR-07.1, FR-07.16), with what a link means beside it. On shows the link to copy; off asks first,
 * since a link turned off never works again (DS-65).
 */
function LinkSharing({
  containerId,
  link,
  disabled,
  onChanged,
}: {
  containerId: string;
  link: ShareSettings["link"];
  disabled: boolean;
  onChanged: () => void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const { run, busy, error, setError } = useSend();
  async function turn(enabled: boolean) {
    const reason = await run({
      name: "share.setLink",
      args: { containerId, linkId: uuidv7(), enabled },
    });
    // With no answer, the confirmation stays, to try again.
    if (reason === unreachable) return;
    setConfirming(false);
    onChanged();
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setError("Couldn't copy. Select the link and copy it.");
    }
  }
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-2 border-t border-subtle pt-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span id={`${id}-title`} className="text-base font-medium text-fg-primary">
            Link sharing
          </span>
          <span id={`${id}-disclosure`} className="text-small text-fg-secondary">
            Anyone with the link can view and forward it.
          </span>
        </div>
        <Switch
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-disclosure`}
          checked={link !== null}
          disabled={disabled || busy}
          onCheckedChange={(checked) => {
            if (checked) void turn(true);
            else setConfirming(true);
          }}
        />
      </div>
      {confirming && (
        <div className="flex flex-col gap-2 rounded-md bg-panel p-3">
          <p className="text-base text-fg-primary">
            Turn off link? This link stops working permanently; turning it back on creates a new
            one.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy} onClick={() => void turn(false)}>
              Turn off
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {link && !confirming && (
        <div className="flex gap-2">
          <Input
            readOnly
            aria-label="Share link"
            value={link.url}
            onFocus={(event) => event.target.select()}
          />
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? (
              <Check strokeWidth={1.5} aria-hidden />
            ) : (
              <Copy strokeWidth={1.5} aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      {error !== undefined && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </section>
  );
}
