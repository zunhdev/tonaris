// The inspector's Links section (DS-46; FR-06.2, FR-06.3): the album's link for each service it has one for, each
// opening that service, in its app on desktop (FR-06.6, TON-104), styled as a link with a ↗ (TON-123). In Editing
// mode every service has a row: a linked one offers Replace and Remove, the others Add. Replace and Add open a field
// that saves on Enter or when left and discards on Escape, checked first as the server will read it (TS-40), so a
// refused link stays with its reason and nothing is sent. Remove applies at once, with Undo (DS-50). Each link shows
// its save state (DS-80). A link capture kept instead of a pasted one shows the pasted one, for an explicit Replace
// (FR-06.4, TON-45).

import { useCapture, type KeptLink } from "@/features/capture/capture-context";
import { ServiceAnchor } from "@/features/open/service-anchor";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useSaveState } from "@/features/sync/save-states";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useState } from "react";

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

import { useMode } from "./collection-ui";
import { useCollectionData } from "./data";
import { useInlineDraft } from "./inline-draft";
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
  const { linksByAlbum, defaults } = useCollectionData();
  const links = new Map((linksByAlbum.get(album.id) ?? []).map((link) => [link.service, link]));
  // Editing offers every service the person uses, from Settings, and any the album already links (TON-138).
  const shown = streamingServices.filter(
    (service) => links.has(service) || (canEdit && !defaults.hiddenServices.includes(service)),
  );
  // Links capture kept instead of pasted ones, while the album still has them (FR-06.4).
  const kept = (useCapture()?.keptLinks ?? []).filter(
    (each) => each.albumId === album.id && links.get(each.service)?.url === each.kept,
  );
  const notices = kept.map((each) => (
    <KeptLinkNotice key={each.service} kept={each} canEdit={canEdit} />
  ));
  // A kept link's notice needs the album's link, so an album without links has none.
  if (shown.length === 0) return <p className="text-small text-fg-tertiary">No links yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {notices}
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

/**
 * "Another Spotify link was found for this album" (DS-46, FR-06.4): capture kept the album's link and reported the
 * pasted one. Replace sets the pasted one, an edit like any other, switching to Editing first; Dismiss keeps the link.
 */
function KeptLinkNotice({ kept, canEdit }: { kept: KeptLink; canEdit: boolean }) {
  const client = useSyncClient();
  const capture = useCapture();
  const { enterEditing } = useMode();
  const offline = useConnection() === "offline";
  const name = serviceNames[kept.service];
  return (
    <li
      data-slot="kept-link"
      className="flex flex-col gap-1.5 rounded-md border border-subtle bg-raised px-3 py-2"
    >
      <p className="text-small text-fg-primary">Another {name} link was found for this album</p>
      <p className="truncate text-small text-fg-tertiary" title={kept.pasted}>
        {shownUrl(kept.pasted)}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={offline}
          onClick={() => {
            if (!client) return;
            if (!canEdit) enterEditing();
            sent(
              client.links.update(serviceLinkKey(kept.albumId, kept.service), (record) => {
                record.url = kept.pasted;
              }),
            );
            capture?.forgetKeptLink(kept.albumId, kept.service);
          }}
        >
          Replace
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => capture?.forgetKeptLink(kept.albumId, kept.service)}
        >
          Dismiss
        </Button>
      </div>
    </li>
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
        <ServiceAnchor
          link={link}
          title={link.url}
          className="group/link flex min-w-0 flex-1 items-center gap-0.5 text-accent-solid outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
        >
          <span className="sr-only">Open in {name}: </span>
          {/* Tonaris's link style, with an underline that firms up on hover (TON-123). */}
          <span className="truncate underline decoration-accent-solid/35 underline-offset-4 group-hover/link:decoration-accent-solid">
            {shownUrl(link.url)}
          </span>
          {/* It opens outside Tonaris: in the service's app, or its page in a new tab (FR-06.6). */}
          <ArrowUpRight aria-hidden strokeWidth={2} className="size-3.5 shrink-0" />
        </ServiceAnchor>
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
  const id = useId();
  const name = serviceNames[service];
  /** Empty, or unchanged, the field closes without sending anything. */
  const unchanged = (typed: string) => typed === "" || typed === link?.url;
  // A save or Escape closes the field; a blur as it goes then changes nothing.
  const { refusal, props } = useInlineDraft<HTMLInputElement>({
    value: link?.url ?? "",
    check: (typed) => (unchanged(typed.trim()) ? undefined : checkLink(service, typed.trim())),
    save: (typed) => {
      const url = typed.trim();
      if (unchanged(url) || !client) return;
      if (link) {
        sent(
          client.links.update(serviceLinkKey(album.id, service), (record) => {
            record.url = url;
          }),
        );
      } else sent(client.links.insert({ albumId: album.id, service, url }));
    },
    onClose,
  });
  const { ref } = props;
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [ref]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small text-fg-secondary">
        {name} link
      </label>
      <input
        {...props}
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Album or track link"
        aria-invalid={refusal !== undefined}
        aria-describedby={refusal === undefined ? undefined : `${id}-error`}
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
