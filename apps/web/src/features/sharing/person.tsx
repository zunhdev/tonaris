// A person's page (DS-121, FR-07.24; TON-295): who they are, then each folder and list shared each way, with its role
// and Pending or Accepted. The owner's open their sharing dialog on a desktop; theirs open the shared view, or the
// invitation while it's pending. A folder says everything inside it is included (FR-07.8). On a desktop, "Stop sharing
// with {name}…" revokes every invitation of the owner's to them after the standard confirmation (X-07), and "Remove
// from People" hides them until a new invitation either way (FR-07.23). A phone reads only.

import { api } from "@/api";
import { ConfirmDialog, type Confirmation } from "@/common/confirm-dialog";
import { useNarrowScreen } from "@/common/media";
import { PageHeader, toCollection, useDocumentTitle } from "@/common/page-header";
import { pageScroll } from "@/common/page-scroll";
import { Avatar } from "@/features/account/avatar";
import { useCollectionDialogs } from "@/features/collection/collection-dialogs";
import { ContainerIcon } from "@/features/collection/icons";
import { shareLocation } from "@/features/collection/place";
import { useAnnounce } from "@/features/sync/announcer";
import { useConnection } from "@/features/sync/sync-provider";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ownerLabel, type PersonShare, type PersonShares } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";

import { sharingChanged } from "./own-sharing";
import { theirsText, yoursText } from "./people-picker";
import { roleNames } from "./role-picker";
import { useSend } from "./send";

type Loaded = { shares?: PersonShares; missing: boolean; failed: boolean };

export function PersonView({ personId }: { personId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ missing: false, failed: false });
  const read = useCallback(
    (isCurrent: () => boolean = () => true) =>
      api.v1
        .people({ id: personId })
        .get()
        .then(
          ({ data, status }) => {
            if (!isCurrent()) return undefined;
            setLoaded(
              data
                ? { shares: data, missing: false, failed: false }
                : { missing: status === 404, failed: status !== 404 },
            );
            return undefined;
          },
          () => {
            if (isCurrent()) setLoaded((previous) => ({ ...previous, failed: true }));
          },
        ),
    [personId],
  );
  useEffect(() => {
    let current = true;
    void read(() => current);
    return () => {
      current = false;
    };
  }, [read]);
  // A role or invitation changed in the sharing dialog shows once it closes.
  const { sharing } = useCollectionDialogs();
  const wasSharing = useRef(false);
  useEffect(() => {
    if (sharing !== undefined) wasSharing.current = true;
    else if (wasSharing.current) {
      wasSharing.current = false;
      void read();
    }
  }, [sharing, read]);

  const { shares, missing, failed } = loaded;
  const person = shares?.person;
  const name = person
    ? (person.displayName ?? person.email ?? ownerLabel(null, { start: true }))
    : missing
      ? "Not one of your people"
      : "";
  useDocumentTitle(name || "People");
  const toPeople = { to: "/people", label: "People" };

  return (
    <>
      <PageHeader title={name} path={[toCollection, toPeople]} />
      <div {...pageScroll("view")} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-3xl flex-col gap-6 p-6">
          {failed && (
            <p className="text-status-danger">Couldn't load this person. Try again later.</p>
          )}
          {missing && (
            <p className="text-fg-secondary">
              This person isn't one of your people.{" "}
              <Link to="/people" className="text-accent-solid underline-offset-4 hover:underline">
                See your people
              </Link>
            </p>
          )}
          {shares && person && (
            <PersonDetails shares={shares} name={name} onChanged={() => void read()} />
          )}
        </div>
      </div>
    </>
  );
}

function PersonDetails({
  shares,
  name,
  onChanged,
}: {
  shares: PersonShares;
  name: string;
  onChanged: () => void;
}) {
  const { person, yours, theirs } = shares;
  const narrow = useNarrowScreen();
  const offline = useConnection() === "offline";
  const navigate = useNavigate();
  const announce = useAnnounce();
  const { run, busy, error } = useSend();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const summary = [yoursText(person.yours), theirsText(person.theirs)].filter(
    (line) => line !== undefined,
  );

  function stopSharing() {
    setConfirmation({
      title: `Stop sharing with ${name}?`,
      scope: yours.map(
        (share) =>
          `"${share.name}" · ${share.kind}${share.kind === "folder" ? ", with everything inside it" : ""}`,
      ),
      consequences: [
        `${name} loses access to these at once, and to any you share with them from Trash. What ${name} shares with you stays.`,
        "This can't be undone: you'd have to invite them again.",
      ],
      action: `Stop sharing with ${name}`,
      onConfirm: () =>
        void run({ name: "share.revokePerson", args: { personId: person.id } }).then((reason) => {
          if (reason === undefined) announce(`Stopped sharing with ${name}`);
          sharingChanged();
          onChanged();
          return undefined;
        }),
    });
  }

  function remove() {
    void run({ name: "people.remove", args: { personId: person.id } }).then((reason) => {
      if (reason !== undefined) return undefined;
      announce(`Removed ${name} from People`);
      return navigate({ to: "/people" });
    });
  }

  return (
    <>
      <section aria-label={name} className="flex items-center gap-3">
        <Avatar name={name} hue={person.avatarHue} className="text-xl size-12" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-fg-primary">
            {name}
            {person.displayName !== null && person.email !== null && (
              <span className="ml-2 text-fg-secondary">{person.email}</span>
            )}
          </span>
          <span className="text-small text-fg-secondary">
            {summary.length > 0 ? summary.join(" · ") : "Nothing shared now"}
          </span>
        </div>
      </section>
      {/* Their About, which they show their people (FR-11.16, TON-296). */}
      {shares.about && <p className="max-w-xl text-fg-primary">{shares.about}</p>}
      {!narrow && (
        <div className="flex flex-wrap gap-2">
          {yours.length > 0 && (
            <Button variant="secondary" disabled={busy || offline} onClick={stopSharing}>
              Stop sharing with {name}…
            </Button>
          )}
          <Button variant="secondary" disabled={busy || offline} onClick={remove}>
            Remove from People
          </Button>
        </div>
      )}
      {error !== undefined && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
      <ShareList
        title={`You share with ${name}`}
        empty={`You don't share anything with ${name}.`}
        shares={yours}
        mine
      />
      <ShareList
        title={`${name} shares with you`}
        empty={`${name} doesn't share anything with you now.`}
        shares={theirs}
        mine={false}
      />
      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(undefined)} />
    </>
  );
}

/** One way's folders and lists (DS-121), by name, each with its kind, role and status. */
function ShareList({
  title,
  empty,
  shares,
  mine,
}: {
  title: string;
  empty: string;
  shares: readonly PersonShare[];
  mine: boolean;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h2 className="text-small font-medium text-fg-tertiary">{title}</h2>
      {shares.length === 0 ? (
        <p className="text-fg-secondary">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {shares.map((share) => (
            <ShareRow key={share.grantId} share={share} mine={mine} />
          ))}
        </ul>
      )}
    </section>
  );
}

const row =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-hover focus-ring-flush";

/** A folder or list shared one way: the owner's opens its sharing dialog on a desktop; theirs, the shared view. */
function ShareRow({ share, mine }: { share: PersonShare; mine: boolean }) {
  const { startShare } = useCollectionDialogs();
  const narrow = useNarrowScreen();
  const content = (
    <>
      <ContainerIcon kind={share.kind} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-fg-primary">"{share.name}"</span>
        <span className="text-small text-fg-secondary">
          {[
            share.kind === "folder" ? "Folder, with everything inside it" : "List",
            roleNames[share.role],
            share.status === "accepted" ? "Accepted" : "Pending",
          ].join(" · ")}
        </span>
      </span>
    </>
  );
  return (
    <li className="border-b border-subtle">
      {mine ? (
        narrow ? (
          <div className={row}>{content}</div>
        ) : (
          <button
            type="button"
            // Its name is what it shows; it opens the sharing dialog.
            aria-haspopup="dialog"
            className={row}
            onClick={() => startShare(share.containerId)}
          >
            {content}
          </button>
        )
      ) : share.status === "pending" ? (
        <Link to="/invitations/$id" params={{ id: share.grantId }} className={row}>
          {content}
        </Link>
      ) : (
        <Link {...shareLocation(share.containerId)} className={row}>
          {content}
        </Link>
      )}
    </li>
  );
}
