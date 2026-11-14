// An album's details (DS-46), as the inspector and `/a/:albumId` show them: the artwork, title and artist with the
// album's save state, over a wash of the cover's color; in Editing mode, its chronology, with which year sorts
// (FR-05.5, FR-05.6); its links (FR-06.2, FR-06.3); its custom fields (FR-03.7); the lists it is in, or Unsorted; and
// its Properties: in Viewing mode its chronology, then when it was added and how many lists and links it has
// (TON-173). Thin lines divide the sections. Viewing mode shows values; Editing mode makes them editors (DS-45). Each edit is one `album.update` from the values it replaces (TS-21), checked by the album
// rules first, so a refused value stays with its reason and nothing is sent (FR-02.6, X-05). Open fields commit when
// Editing mode is left. A change from elsewhere never overwrites a field being edited (DS-82).

import { sent } from "@/client/sync/writer";
import { ordered } from "@/features/open/service-choices";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useSaveState } from "@/features/sync/save-states";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { Link } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import {
  artworkUrlRefusal,
  chronology,
  groupNames,
  isArtworkUrl,
  membershipKey,
  serviceNames,
  uuidv7Time,
  type Album,
  type AlbumFields,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Field } from "@tonaris/ui/components/field";
import { Input } from "@tonaris/ui/components/input";
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
import { useCollectionDialogs } from "./collection-dialogs";
import { useMode } from "./collection-mode";
import { effectiveColor, tintedChip } from "./container-palette";
import { CoverWash } from "./cover-wash";
import { useCollectionData } from "./data";
import { FindArtwork } from "./find-artwork";
import { useInlineDraft } from "./inline-draft";
import { ContainerLink } from "./place";
import { ancestorsOf } from "./tree";

const addedDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Which year sorts the album (FR-05.5, FR-05.6), in words, from the domain's `chronology` (DRIFT-052). */
function sortHint(album: Album): string {
  const { recorded, fallback } = chronology(album);
  if (recorded) return "Sorts by its recording year.";
  return fallback
    ? "Sorts by its release year, as the recording year is unknown."
    : "Sorts by its original release year.";
}

export function AlbumDetails({ album }: { album: Album }) {
  const client = useSyncClient();
  const { editing } = useMode();
  const offline = useConnection() === "offline";
  const status = useSaveState(album.id);
  const [choiceRefusal, setChoiceRefusal] = useState<string>();
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

  const src = artworkSrc(album);
  return (
    // `isolate` keeps the wash behind this panel's content only.
    <div className="relative isolate flex flex-col gap-5 p-4">
      <CoverWash src={src} />
      <div className="flex flex-col gap-3">
        <Artwork
          title={album.title}
          src={src}
          label={`Cover of ${album.title}`}
          eager
          raised
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

      {canEdit && (
        <Section title="Chronology">
          <div className="flex flex-col gap-3">
            <Field group label="Release type">
              {(_, labelId) => (
                <SegmentedControl
                  aria-labelledby={labelId}
                  options={releaseTypeOptions}
                  value={album.releaseType ?? "unknown"}
                  onValueChange={(value) =>
                    choose({ releaseType: value === "unknown" ? null : value })
                  }
                />
              )}
            </Field>
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
          <p className="text-small text-fg-tertiary">{sortHint(album)}</p>
        </Section>
      )}

      <Section title="Links">
        <LinksSection album={album} canEdit={canEdit} />
      </Section>

      <Section title="Custom fields">
        <CustomFieldsSection album={album} canEdit={canEdit} />
      </Section>

      <ListsSection album={album} canEdit={canEdit} />

      <PropertiesSection album={album} withChronology={!canEdit} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    // A thin line above each section divides the panel (TON-173).
    <section aria-labelledby={id} className="flex flex-col gap-2 border-t border-subtle pt-5">
      <h3 id={id} className="text-small font-medium text-fg-secondary">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The album's read-only facts in one block at the end (DS-46, TON-173), labels left, values right: in Viewing mode,
 * its chronology, with which year sorts; then when it was added, how many lists it is in, and the services it has
 * links for.
 */
function PropertiesSection({ album, withChronology }: { album: Album; withChronology: boolean }) {
  const { listsByAlbum, linksByAlbum } = useCollectionData();
  const added = uuidv7Time(album.id);
  const lists = listsByAlbum.get(album.id)?.length ?? 0;
  const links = ordered(linksByAlbum.get(album.id)).map((link) => serviceNames[link.service]);
  return (
    <Section title="Properties">
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        {withChronology && (
          <>
            <Property term="Release type">
              {album.releaseType === null ? "Unknown" : groupNames[album.releaseType]}
            </Property>
            <Property term="Live">{album.isLive === true ? "Yes" : "No"}</Property>
            <Property term="Original release year">
              {cellText(album, "originalYear") || "—"}
            </Property>
            {album.isLive === true && (
              <Property term="Recording year or range">
                {cellText(album, "recording") || "—"}
              </Property>
            )}
          </>
        )}
        <Property term="Added">
          {added === undefined ? "Unknown" : addedDate.format(added)}
        </Property>
        <Property term="In lists">{lists === 0 ? "None, in Unsorted" : lists}</Property>
        <Property term="Links">{links.length === 0 ? "None" : links.join(", ")}</Property>
      </dl>
      {withChronology && <p className="text-small text-fg-tertiary">{sortHint(album)}</p>}
    </Section>
  );
}

function Property({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-tertiary">{term}</dt>
      <dd className="min-w-0 text-fg-primary tabular-nums">{children}</dd>
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

  return (
    <Field
      // Without its name above it, the field is named for assistive technology with the album's title.
      label={labelled ? cellNames[cell] : `${cellNames[cell]} of '${album.title}'`}
      hideLabel={!labelled}
      problem={refusal}
      className="gap-1"
    >
      {(control) => <Input {...props} {...control} className={className} />}
    </Field>
  );
}

/**
 * The artwork's URL, in Editing mode (FR-03.4): Enter or leaving the field saves it as one `album.update`, empty clears
 * it, and Escape discards. A URL that isn't an https link stays with its reason. Find artwork saves a chosen cover
 * the same way (TON-112). The artwork shows through the image proxy once the server has signed it (TS-103).
 */
function ArtworkUrlEditor({ album }: { album: Album }) {
  const client = useSyncClient();
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
    <Field label="Artwork URL" problem={refusal} className="w-full max-w-[500px] gap-1">
      {(control) => (
        // Find sits beside the field it fills (TON-124).
        <div className="flex items-center gap-1">
          <Input
            {...props}
            {...control}
            type="url"
            placeholder="https://…"
            spellCheck={false}
            className="flex-1 text-small"
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
      )}
    </Field>
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
  const { startAddToList } = useCollectionDialogs();
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
            // Tinted with its own or its folder's color (TON-175).
            const tint = tintedChip(effectiveColor(list, tree.byId));
            return (
              <li key={list.id} className="flex items-center">
                <ContainerLink
                  container={list}
                  title={[...path, list.name].join(" › ")}
                  data-color={effectiveColor(list, tree.byId) ?? undefined}
                  className={cn(chip, tint, canEdit && "rounded-r-none pr-1.5")}
                >
                  {list.name}
                </ContainerLink>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remove from ${list.name}`}
                    onClick={() => remove(list.id, list.name)}
                    className={cn(
                      "flex h-6 items-center rounded-r-full border border-l-0 border-subtle bg-raised px-1.5 text-fg-tertiary focus-ring-flush outline-none hover:text-fg-primary",
                      tint,
                    )}
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
  "flex h-6 items-center rounded-full border border-subtle bg-raised px-2.5 text-small text-fg-primary outline-none hover:bg-hover focus-ring-flush";
