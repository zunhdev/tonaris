// Settings → Profile's favorite albums (DS-93, FR-11.16; TON-297): up to four of the person's own albums, in order,
// which their people see on their page in People. Each row has its cover, title and artist, with ↑ and ↓ to move it
// and Remove; one in Trash is marked, and keeps its place until it's restored or purged. Under four, "Add a
// favorite…" opens a dialog that finds an album by typing its title or artist, as "Add to a list" finds lists
// (DS-115). Each change saves at once.

import { api } from "@/api";
import { Artwork, artworkSrc } from "@/features/collection/artwork";
import { useCollectionData } from "@/features/collection/data";
import { Finder, type FinderItem } from "@/features/collection/finder";
import { matchLimit } from "@/features/collection/list-picker";
import { useSend } from "@/features/sharing/send";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { maxFavorites, type OwnFavorites } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";

import { albumChoices, findAlbums, moved, type AlbumChoice } from "./favorite-picker";

type Favorites = OwnFavorites["favorites"];

export function FavoriteAlbums() {
  const id = useId();
  const [favorites, setFavorites] = useState<Favorites>();
  const [adding, setAdding] = useState(false);
  // Each opening's own finder, so it starts empty; kept while the dialog closes.
  const [opening, setOpening] = useState(0);
  const { run, busy, error } = useSend();
  const read = useCallback(
    () =>
      api.v1.me.favorites.get().then(({ data }) => {
        if (data) setFavorites(data.favorites);
        return undefined;
      }),
    [],
  );
  useEffect(() => {
    void read();
  }, [read]);

  async function save(albumIds: string[]) {
    await run({ name: "account.setFavorites", args: { albumIds } });
    await read();
  }
  const ids = favorites?.map((favorite) => favorite.albumId) ?? [];

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h2 id={`${id}-title`} className="text-base font-medium text-fg-primary">
        Favorite albums
      </h2>
      <p className="text-small text-fg-secondary">
        Up to {maxFavorites} of your albums. People you invite, and people whose invitations you
        accept, see their covers, titles and artists.
      </p>
      {favorites && favorites.length > 0 && (
        <ol aria-label="Favorite albums" className="flex max-w-xl flex-col">
          {favorites.map((favorite, at) => (
            <li
              key={favorite.albumId}
              className="flex items-center gap-3 border-b border-subtle py-2"
            >
              <Artwork title={favorite.title} src={artworkSrc(favorite)} className="size-10" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-fg-primary">{favorite.title}</span>
                <span className="truncate text-small text-fg-secondary">
                  {favorite.trashed
                    ? "In Trash. It shows again if you restore it."
                    : favorite.artistCredit}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${favorite.title} up`}
                disabled={busy || at === 0}
                onClick={() => void save(moved(ids, at, -1))}
              >
                <ArrowUp strokeWidth={1.5} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${favorite.title} down`}
                disabled={busy || at === favorites.length - 1}
                onClick={() => void save(moved(ids, at, 1))}
              >
                <ArrowDown strokeWidth={1.5} aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${favorite.title}`}
                disabled={busy}
                onClick={() => void save(ids.filter((each) => each !== favorite.albumId))}
              >
                <X strokeWidth={1.5} aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {favorites && favorites.length < maxFavorites && (
        <Button
          variant="secondary"
          className="self-start"
          disabled={busy}
          onClick={() => {
            setOpening((count) => count + 1);
            setAdding(true);
          }}
        >
          Add a favorite…
        </Button>
      )}
      {error !== undefined && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <AddFavorite
          key={opening}
          except={ids}
          onChoose={(albumId) => {
            setAdding(false);
            void save([...ids, albumId]);
          }}
        />
      </Dialog>
    </section>
  );
}

/** An album as the finder offers it: its cover, title and artist. */
const item = ({ album }: AlbumChoice): FinderItem<string> => ({
  value: album.id,
  key: album.id,
  icon: <Artwork title={album.title} src={artworkSrc(album)} className="size-6" />,
  content: (
    <>
      {album.title}
      <span className="ml-2 text-fg-secondary">{album.artistCredit}</span>
    </>
  ),
});

/** "Add a favorite album": the person's albums not already favorites, found by typing (DS-115). */
function AddFavorite({
  except,
  onChoose,
}: {
  except: readonly string[];
  onChoose: (albumId: string) => void;
}) {
  const { albumsById } = useCollectionData();
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const choices = useMemo(() => albumChoices(albumsById.values(), except), [albumsById, except]);
  const found = useMemo(() => findAlbums(choices, query), [choices, query]);
  const typed = query.trim() !== "";
  const note = !typed
    ? "Type a title or artist."
    : found.total === 0
      ? `No albums match '${query.trim()}'.`
      : found.total > matchLimit
        ? `Showing ${matchLimit} of ${found.total}. Keep typing to narrow them down.`
        : undefined;
  return (
    <DialogContent initialFocus={() => field.current ?? true}>
      <DialogHeader>
        <DialogTitle>Add a favorite album</DialogTitle>
        <DialogDescription>Choose one of your albums.</DialogDescription>
      </DialogHeader>
      <Finder
        label="Find an album"
        listLabel="Albums"
        field={field}
        query={query}
        onQuery={setQuery}
        groups={[{ title: undefined, items: found.shown.map(item) }]}
        onChoose={onChoose}
        note={note}
        status={typed ? `${found.total} found` : ""}
      />
    </DialogContent>
  );
}
