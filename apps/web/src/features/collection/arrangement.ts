// A view's items as its person presents them (FR-05.1, FR-05.7, DS-49), for the owner's views and for shared ones,
// whose presentation is the viewer's own (DS-70): sorted, albums grouped, as chosen, and under Manual in the person's
// arrangement (TS-16), with the moves that rearrange it. Grouped, an album moves among its group's albums, in the one
// arrangement (FR-05.8).

import { useMemo } from "react";

import type { Album, Container } from "@tonaris/domain";

import { useCollectionData } from "./data";
import { sections as sectionsOf, sortAlbums, sortContainers, type Direction } from "./order";
import { usePresentation } from "./use-presentation";
import { useRearrange } from "./use-rearrange";

/** What an album needs to be sorted, grouped and named. */
type Arranged = Pick<
  Album,
  | "id"
  | "title"
  | "artistCredit"
  | "isLive"
  | "releaseType"
  | "originalYear"
  | "recordingYearStart"
  | "recordingYearEnd"
>;

type Moves = {
  /** ⌥↑ / ⌥↓ on an item, with ⇧ for the ends; answers whether it moved. */
  move: (id: string, to: Direction) => boolean;
  /** A drop of an item before or after another; answers whether it moved. */
  drop: (id: string, place: { before: string } | { after: string }) => boolean;
};

/** A list's or Unsorted's albums, in `albums`' fallback order, as the view `viewKey` presents them. */
export function useAlbumArrangement<T extends Arranged>(albums: readonly T[], viewKey: string) {
  const { keys } = useCollectionData();
  const { presentation, choose } = usePresentation(viewKey, "albums");
  const { sortMode, sortDir, grouped } = presentation;
  const viewKeys = keys.get(viewKey);
  const manualOrder = useMemo(
    () => sortAlbums(albums, { mode: "manual", dir: sortDir }, viewKeys),
    [albums, sortDir, viewKeys],
  );
  const sections = useMemo(
    () =>
      sectionsOf(
        sortMode === "manual" ? manualOrder : sortAlbums(albums, { mode: sortMode, dir: sortDir }),
        grouped,
      ),
    [albums, manualOrder, sortMode, sortDir, grouped],
  );
  const rearrange = useRearrange(viewKey, {
    manual: sortMode === "manual",
    toManual: () => choose({ sortMode: "manual" }),
  });
  const moves = useMemo<Moves>(() => {
    const sequence = manualOrder.map((album) => album.id);
    const groupOf = (id: string) =>
      (
        sections.find((section) => section.albums.some((album) => album.id === id))?.albums ?? []
      ).map((album) => album.id);
    const nameOf = (id: string) =>
      manualOrder.find((album) => album.id === id)?.title ?? "the album";
    return {
      move: (id, to) => rearrange.move(sequence, groupOf(id), id, to, nameOf(id)),
      drop: (id, place) => rearrange.drop(sequence, groupOf(id), id, place, nameOf(id)),
    };
  }, [manualOrder, sections, rearrange]);
  return { presentation, sections, manual: rearrange.manual, moves };
}

/** A folder's or the root's folders and lists, as the view `viewKey` presents them. */
export function useContainerArrangement<T extends Pick<Container, "id" | "kind" | "name">>(
  items: readonly T[],
  viewKey: string,
) {
  const { keys } = useCollectionData();
  const { presentation, choose } = usePresentation(viewKey, "containers");
  const { sortMode, sortDir } = presentation;
  const viewKeys = keys.get(viewKey);
  const manualOrder = useMemo(
    () => sortContainers(items, { mode: "manual", dir: sortDir }, viewKeys),
    [items, sortDir, viewKeys],
  );
  const shown = useMemo(
    () =>
      sortMode === "manual" ? manualOrder : sortContainers(items, { mode: sortMode, dir: sortDir }),
    [items, manualOrder, sortMode, sortDir],
  );
  const rearrange = useRearrange(viewKey, {
    manual: sortMode === "manual",
    toManual: () => choose({ sortMode: "manual" }),
  });
  const moves = useMemo<Moves>(() => {
    const sequence = manualOrder.map((item) => item.id);
    const nameOf = (id: string) =>
      items.find((item) => item.id === id)?.name ?? "the folder or list";
    return {
      move: (id, to) => rearrange.move(sequence, sequence, id, to, nameOf(id)),
      drop: (id, place) => rearrange.drop(sequence, sequence, id, place, nameOf(id)),
    };
  }, [items, manualOrder, rearrange]);
  return { presentation, shown, manual: rearrange.manual, moves };
}
