// The inspector's Links section (DS-46; FR-06.2, FR-06.3): the album's link for each service it has one for, each
// opening that service's page in a new tab until "Open in…" arrives (TON-47). In Editing mode every service has a row:
// a linked one offers Replace and Remove, the others Add. Replace and Add open a field that saves on Enter or when
// left and discards on Escape, checked first as the server will read it (TS-40), so a refused link stays with its
// reason and nothing is sent. Remove applies at once, with Undo (DS-50). Each link shows its save state (DS-80).

import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useSaveState } from "@/features/sync/save-states";
import { useSyncClient } from "@/features/sync/sync-provider";
import { ExternalLink } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  serviceLinkKey,
  serviceNames,
  streamingServices,
  type Album,
  type ServiceLink,
  type StreamingService,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionUi } from "./collection-ui";
import { useCollectionData } from "./data";
import { checkLink } from "./link-check";

/** A save the save-state layer reports if it fails; a rejection is expected there, not here. */
const sent = (transaction: { isPersisted: { promise: Promise<unknown> } }) => {
  transaction.isPersisted.promise.catch(() => {});
};

/** A link as people read it: its host and path, without the scheme. */
function shownUrl(url: string): string {
  try {
    const { host, pathname, search } = new URL(url);
    return `${host}${pathname}${search}`;
  } catch {
    return url;
  }
}

export function LinksSection({ album, canEdit }: { album: Album; canEdit: boolean }) {
  const { linksByAlbum } = useCollectionData();
  const links = new Map((linksByAlbum.get(album.id) ?? []).map((link) => [link.service, link]));
  const shown = canEdit
    ? streamingServices
    : streamingServices.filter((service) => links.has(service));
  if (shown.length === 0) return <p className="text-small text-fg-tertiary">No links yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {shown.map((service) => (
        <LinkRow
          key={service}
          album={album}
          service={service}
          link={links.get(service)}
          canEdit={canEdit}
        />
      ))}
    </ul>
  );
}

function LinkRow({
  album,
  service,
  link,
  canEdit,
}: {
  album: Album;
  service: StreamingService;
  link: ServiceLink | undefined;
  canEdit: boolean;
}) {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  const [editing, setEditing] = useState(false);
  const status = useSaveState(serviceLinkKey(album.id, service));
  const name = serviceNames[service];

  function remove(removed: ServiceLink) {
    if (!client) return;
    sent(client.links.delete(serviceLinkKey(removed.albumId, removed.service)));
    announce(`Removed the ${name} link of ${album.title}`);
    notify?.undo({
      title: `Removed the ${name} link`,
      onUndo: () => sent(client.links.insert(removed)),
    });
  }

  if (canEdit && editing) {
    return (
      <li>
        <LinkEditor album={album} service={service} link={link} onClose={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-fg-secondary">{name}</span>
      {link ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.url}
          className="flex min-w-0 flex-1 items-center gap-1 text-fg-primary underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
        >
          <span className="sr-only">Open in {name}: </span>
          <span className="truncate">{shownUrl(link.url)}</span>
          <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
        </a>
      ) : (
        <span className="flex-1 text-fg-tertiary">—</span>
      )}
      {status && <SaveStateMarker status={status} />}
      {canEdit &&
        (link ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Replace the ${name} link`}
              onClick={() => setEditing(true)}
            >
              Replace
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove the ${name} link`}
              onClick={() => remove(link)}
            >
              Remove
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Add {name} link
          </Button>
        ))}
    </li>
  );
}

/**
 * A field for the service's link: Enter or leaving it saves, Escape discards, and leaving Editing mode commits it. A
 * refused link stays with its reason. Empty, or unchanged, it closes without sending anything.
 */
function LinkEditor({
  album,
  service,
  link,
  onClose,
}: {
  album: Album;
  service: StreamingService;
  link: ServiceLink | undefined;
  onClose: () => void;
}) {
  const client = useSyncClient();
  const { registerEditor } = useCollectionUi();
  const [draft, setDraftState] = useState(link?.url ?? "");
  const [refusal, setRefusal] = useState<string>();
  const current = useRef(draft);
  // Closed already, by a save or by Escape: a blur as the field goes changes nothing.
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const name = serviceNames[service];
  const setDraft = (next: string) => {
    current.current = next;
    setDraftState(next);
  };

  /** Saves the draft, or shows why it can't be saved; whether the field closed. */
  const commit = useRef<() => boolean>(() => true);
  useEffect(() => {
    const close = () => {
      done.current = true;
      onClose();
      return true;
    };
    commit.current = () => {
      if (done.current) return true;
      const typed = current.current.trim();
      if (typed === "" || typed === link?.url) return close();
      const reason = checkLink(service, typed);
      if (reason !== undefined) {
        setRefusal(reason);
        return false;
      }
      if (client) {
        if (link) {
          sent(
            client.links.update(serviceLinkKey(album.id, service), (record) => {
              record.url = typed;
            }),
          );
        } else sent(client.links.insert({ albumId: album.id, service, url: typed }));
      }
      return close();
    };
  });
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    return registerEditor(() => {
      const closed = commit.current();
      if (!closed) input.current?.focus();
      return closed;
    });
  }, [registerEditor]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small text-fg-secondary">
        {name} link
      </label>
      <input
        ref={input}
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Album or track link"
        aria-invalid={refusal !== undefined}
        aria-describedby={refusal === undefined ? undefined : `${id}-error`}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setRefusal(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit.current();
          } else if (event.key === "Escape") {
            // Discards the draft; the inspector stays open.
            event.preventDefault();
            event.stopPropagation();
            done.current = true;
            onClose();
          }
        }}
        onBlur={() => commit.current()}
        className={cn(
          "h-8 min-w-0 rounded-md border border-subtle bg-panel px-2 text-fg-primary outline-none hover:border-strong focus-visible:border-strong focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
          refusal !== undefined && "border-status-danger",
        )}
      />
      {refusal !== undefined && (
        <p id={`${id}-error`} className="text-small text-status-danger">
          {refusal}
        </p>
      )}
    </div>
  );
}
