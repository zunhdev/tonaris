// The owner's lists as a destination picker offers them (DS-47, DS-48): each with its folder path, by that path.

import { useMemo } from "react";

import { useCollectionData } from "./data";
import { ancestorsOf } from "./tree";

export type ListOption = { id: string; label: string };

/** The owner's lists, labelled "Folder › List", sorted by label. */
export function useListOptions(): ListOption[] {
  const { tree } = useCollectionData();
  return useMemo(
    () =>
      [...tree.byId.values()]
        .filter((container) => container.kind === "list")
        .map((list) => ({
          id: list.id,
          label: [...ancestorsOf(tree, list.id).map((folder) => folder.name), list.name].join(
            " › ",
          ),
        }))
        .toSorted((a, b) => a.label.localeCompare(b.label)),
    [tree],
  );
}
