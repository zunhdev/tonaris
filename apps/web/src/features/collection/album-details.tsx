// An album's details (DS-46), as the inspector and `/a/:albumId` show them: the artwork, title and artist with the
// album's save state; its chronology, with which year sorts (FR-05.5, FR-05.6); its links (FR-06.2, FR-06.3); its
// custom fields (FR-03.7); the lists it is in, or Unsorted; and when it was added. Viewing mode shows
// values; Editing mode makes them editors (DS-45). Each edit is one `album.update` from the values it replaces (TS-21), checked by the album
// rules first, so a refused value stays with its reason and nothing is sent (FR-02.6, X-05). Open fields commit when
// Editing mode is left. A change from elsewhere never overwrites a field being edited (DS-82).

import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useSaveState } from "@/features/sync/save-states";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { Link } from "@tanstack/react-router";
import { Plus, Trash2, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import {
  artworkUrlRefusal,
  groupNames,
  isArtworkUrl,
  membershipKey,
  uuidv7Time,
  type Album,
  type AlbumFields,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { SegmentedControl } from "@tonaris/ui/components/segmented-control";
import { Switch } from "@tonaris/ui/components/switch";
import { cn } from "@tonaris/ui/lib/utils";

import {
  albumChoice,
  albumEdit,
  cellNames,
  cellText,
  releaseTypeOptions,
  type AlbumCell,
} from "./album-edit";
import { CustomFieldsSection } from "./album-fields";
import { LinksSection } from "./album-links";
import { Artwork, artworkSrc } from "./artwork";
import { useCollectionUi, useMode } from "./collection-ui";
import { useCollectionData } from "./data";
import { FindArtwork } from "./find-artwork";
import { useInlineDraft } from "./inline-draft";
import { ancestorsOf } from "./tree";

const addedDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Which year sorts the album (FR-05.5, FR-05.6), in words. */
function sortHint(album: Album): string {
  if (album.isLive !== true) return "Sorts by its original release year.";
  return album.recordingYearStart === null
    ? "Sorts by its release year, as the recording year is unknown."
    : "Sorts by its recording year.";
}

/** A save the save-state layer reports if it fails; a rejection is expected there, not here. */
const sent = (transaction: { isPersisted: { promise: Promise<unknown> } }) => {
  transaction.isPersisted.promise.catch(() => {});
};

export function AlbumDetails({ album }: { album: Album }) {
  const { startDeleteAlbum } = useCollectionUi();
  const client = useSyncClient();
  const { editing } = useMode();
  const offline = useConnection() === "offline";
  const status = useSaveState(album.id);
  const [choiceRefusal, setChoiceRefusal] = useState<string>();
  const added = uuidv7Time(album.id);
  const liveId = useId();
  // Editing waits while offline (DS-81).
  const canEdit = editing && !offline;

  function choose(values: Partial<Pick<AlbumFields, "releaseType" | "isLive">>) {
    const result = albumChoice(album, values);
    if (result.kind === "refuse") {
      setChoiceRefusal(result.reason);
      return;
    }
    setChoiceRefusal(undefined);
    if (result.kind === "save" && client) {
      sent(
        client.albums.update(album.id, (draft) => {
          Object.assign(draft, result.values);
        }),
      );
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-3">
        <Artwork
          title={album.title}
          src={artworkSrc(album)}
          label={`Cover of ${album.title}`}
          // The panel's width, up to the 500 px of the covers Find brings (TON-124).
          className="w-full max-w-[500px] rounded-md"
          letterClassName="text-display"
        />
        {canEdit && <ArtworkUrlEditor album={album} />}
        {canEdit ? (
          <>
            {/* The sections' headings stay under the album's, as fields replace it. */}
            <h2 className="sr-only">{album.title}</h2>
            <FieldEditor album={album} cell="title" className="text-title font-medium" />
            <FieldEditor album={album} cell="artistCredit" />
          </>
        ) : (
          <div className="flex flex-col gap-0.5">
            <h2 className="text-title text-fg-primary">{album.title}</h2>
            <p className="text-fg-secondary">{album.artistCredit}</p>
          </div>
        )}
        {status && (
          <span className="flex items-center gap-1.5 text-small text-fg-secondary">
            <SaveStateMarker status={status} />
          </span>
        )}
        {editing && offline && (
          <p className="text-small text-fg-tertiary">
            You're offline. Changes can wait until the connection is back.
          </p>
        )}
      </div>

      <Section title="Chronology">
        {canEdit ? (
          <div className="flex flex-col gap-3">
            <Labelled label="Release type">
              {(id) => (
                <SegmentedControl
                  aria-labelledby={id}
                  options={releaseTypeOptions}
                  value={album.releaseType ?? "unknown"}
                  onValueChange={(value) =>
                    choose({ releaseType: value === "unknown" ? null : value })
                  }
                />
              )}
            </Labelled>
            <div className="flex items-center justify-between gap-3">
              <span id={liveId} className="text-fg-secondary">
                Live
              </span>
              <Switch
                aria-labelledby={liveId}
                checked={album.isLive === true}
                onCheckedChange={(checked) => choose({ isLive: checked })}
              />
            </div>
            {choiceRefusal && <p className="text-small text-status-danger">{choiceRefusal}</p>}
            <FieldEditor album={album} cell="originalYear" labelled />
            {album.isLive === true && <FieldEditor album={album} cell="recording" labelled />}
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <Value term="Release type">
              {album.releaseType === null ? "Unknown" : groupNames[album.releaseType]}
            </Value>
            <Value term="Live">{album.isLive === true ? "Yes" : "No"}</Value>
            <Value term="Original release year">{cellText(album, "originalYear") || "—"}</Value>
            {album.isLive === true && (
              <Value term="Recording year or range">{cellText(album, "recording") || "—"}</Value>
            )}
          </dl>
        )}
        <p className="text-small text-fg-tertiary">{sortHint(album)}</p>
      </Section>

      <Section title="Links">
        <LinksSection album={album} canEdit={canEdit} />
      </Section>

      <Section title="Custom fields">
        <CustomFieldsSection album={album} canEdit={canEdit} />
      </Section>

      <ListsSection album={album} canEdit={canEdit} />

      <Section title="Info">
        <p className="text-small text-fg-secondary">
          {added === undefined ? "Added date unknown" : `Added ${addedDate.format(added)}`}
        </p>
      </Section>

      {canEdit && (
        <div>
          <Button
            variant="danger"
            aria-keyshortcuts="Meta+Backspace"
            onClick={() => startDeleteAlbum(album.id)}
          >
            <Trash2 aria-hidden strokeWidth={1.5} />
            Delete from collection…
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-small font-medium text-fg-secondary">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Labelled({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-small text-fg-secondary">
        {label}
      </span>
      {children(id)}
    </div>
  );
}

function Value({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-secondary">{term}</dt>
      <dd className="text-fg-primary tabular-nums">{children}</dd>
    </>
  );
}

/**
 * A text field of the album, in Editing mode: Enter or leaving it saves, Escape discards. A refused value stays
 * with its reason. While it holds a draft, changes from elsewhere don't replace it (DS-82), and leaving Editing mode
 * commits it.
 */
function FieldEditor({
  album,
  cell,
  className,
  labelled = false,
}: {
  album: Album;
  cell: AlbumCell;
  className?: string;
  /** Whether the field shows its name above it, rather than only to assistive technology. */
  labelled?: boolean;
}) {
  const client = useSyncClient();
  const id = useId();
  const { refusal, props } = useInlineDraft<HTMLInputElement>({
    value: cellText(album, cell),
    check: (typed) => {
      const result = albumEdit(album, cell, typed);
      return result.kind === "refuse" ? result.reason : undefined;
    },
    save: (typed) => {
      const result = albumEdit(album, cell, typed);
      if (result.kind !== "save" || !client) return;
      sent(
        client.albums.update(album.id, (record) => {
          Object.assign(record, result.values);
        }),
      );
    },
  });

  const name = `${cellNames[cell]} of '${album.title}'`;
  return (
    <div className="flex flex-col gap-1">
      {labelled && (
        <label htmlFor={id} className="text-small text-fg-secondary">
          {cellNames[cell]}
        </label>
      )}
      <input
        {...props}
        id={id}
        aria-label={labelled ? undefined : name}
        aria-invalid={refusal !== undefined}
        aria-describedby={refusal === undefined ? undefined : `${id}-error`}
        className={cn(
          "h-8 min-w-0 rounded-md border border-subtle bg-panel px-2 text-fg-primary outline-none hover:border-strong focus-visible:border-strong focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
          refusal !== undefined && "border-status-danger",
          className,
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

/**
 * The artwork's URL, in Editing mode (FR-03.4): Enter or leaving the field saves it as one `album.update`, empty clears
 * it, and Escape discards. A URL that isn't an https link stays with its reason. Find artwork saves a chosen cover
 * the same way (TON-112). The artwork shows through the image proxy once the server has signed it (TS-103).
 */
function ArtworkUrlEditor({ album }: { album: Album }) {
  const client = useSyncClient();
  const id = useId();
  /** Saves the artwork's URL, null for none, unless it is already the album's. */
  const saveUrl = (artworkUrl: string | null) => {
    if (artworkUrl === album.artworkUrl || !client) return;
    sent(
      client.albums.update(album.id, (record) => {
        record.artworkUrl = artworkUrl;
      }),
    );
  };
  const { refusal, props, discard } = useInlineDraft<HTMLInputElement>({
    value: album.artworkUrl ?? "",
    check: (typed) => {
      const value = typed.trim();
      return value !== "" && !isArtworkUrl(value) ? artworkUrlRefusal : undefined;
    },
    save: (typed) => saveUrl(typed.trim() || null),
  });

  return (
    <div className="flex w-full max-w-[500px] flex-col gap-1">
      <label htmlFor={id} className="text-small text-fg-secondary">
        Artwork URL
      </label>
      {/* Find sits beside the field it fills (TON-124). */}
      <div className="flex items-center gap-1">
        <input
          {...props}
          id={id}
          type="url"
          placeholder="https://…"
          spellCheck={false}
          aria-invalid={refusal !== undefined}
          aria-describedby={refusal === undefined ? undefined : `${id}-error`}
          className={cn(
            "h-8 min-w-0 flex-1 rounded-md border border-subtle bg-panel px-2 text-small text-fg-primary outline-none hover:border-strong focus-visible:border-strong focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
            refusal !== undefined && "border-status-danger",
          )}
        />
        <FindArtwork
          title={album.title}
          artist={album.artistCredit}
          onChoose={(artworkUrl) => {
            // A chosen cover is an artwork edit like a typed one, replacing whatever was typed.
            discard();
            saveUrl(artworkUrl);
          }}
        />
      </div>
      {refusal !== undefined && (
        <p id={`${id}-error`} className="text-small text-status-danger">
          {refusal}
        </p>
      )}
    </div>
  );
}

/**
 * The lists the album is in, as chips linking to them, or Unsorted (DS-46). In Editing mode, a chip's × takes the
 * album out of that list, with Undo (DS-50), and "+ Add to list" opens the picker.
 */
function ListsSection({ album, canEdit }: { album: Album; canEdit: boolean }) {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  const { tree, listsByAlbum } = useCollectionData();
  const { startAddToList } = useCollectionUi();
  const lists = (listsByAlbum.get(album.id) ?? [])
    .flatMap((listId) => tree.byId.get(listId) ?? [])
    .toSorted((a, b) => a.name.localeCompare(b.name));

  function remove(listId: string, name: string) {
    if (!client) return;
    sent(client.memberships.delete(membershipKey(listId, album.id)));
    announce(`Removed ${album.title} from ${name}`);
    notify?.undo({
      title: `Removed from ${name}`,
      onUndo: () => {
        sent(
          client.memberships.insert({
            listId,
            albumId: album.id,
            addedAt: new Date().toISOString(),
          }),
        );
      },
    });
  }

  return (
    <Section title="Lists">
      <ul className="flex flex-wrap gap-1.5">
        {lists.length === 0 ? (
          <li>
            <Link to="/unsorted" className={chip}>
              Unsorted
            </Link>
          </li>
        ) : (
          lists.map((list) => {
            const path = ancestorsOf(tree, list.id).map((folder) => folder.name);
            return (
              <li key={list.id} className="flex items-center">
                <Link
                  to="/l/$listId"
                  params={{ listId: list.id }}
                  title={[...path, list.name].join(" › ")}
                  className={cn(chip, canEdit && "rounded-r-none pr-1.5")}
                >
                  {list.name}
                </Link>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remove from ${list.name}`}
                    onClick={() => remove(list.id, list.name)}
                    className="flex h-6 items-center rounded-r-full border border-l-0 border-subtle bg-raised px-1.5 text-fg-tertiary outline-none hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
                  >
                    <X aria-hidden strokeWidth={1.5} className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          aria-keyshortcuts="L"
          onClick={() => startAddToList(album.id)}
        >
          <Plus aria-hidden strokeWidth={1.5} />
          Add to list
        </Button>
      )}
    </Section>
  );
}

const chip =
  "flex h-6 items-center rounded-full border border-subtle bg-raised px-2.5 text-small text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid";
