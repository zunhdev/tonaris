// What "Find a folder" offers (DS-49, DS-56; TON-183): the places a folder or list can go, found by typing, since there
// can be hundreds of folders. Collection comes first before anything is typed, then the folders this device last moved
// things into, then others by path, 8 folders in all (decided with the creator, 8 November 2026). Typing finds folders
// as "Find a list" finds lists (`findByPath`), and Collection by its name. Pure, so the rules are tested without a DOM.

import { byBytes, searchKey } from "@tonaris/domain";

import { suggestedCount, type PathChoice } from "./list-picker";
import { ancestorsOf, destinations, type Tree } from "./tree";

/** A place to move to: a folder with the folders above it, or Collection, whose `parentId` is null. */
export type FolderChoice = PathChoice & { parentId: string | null };

/**
 * The places that can take `moving`, or every place without it: Collection first, if it can, then the folders by path.
 */
export function folderChoices(tree: Tree, { moving }: { moving?: string } = {}): FolderChoice[] {
  const choices: FolderChoice[] = [];
  let collection: FolderChoice | undefined;
  for (const { parentId, name } of destinations(tree, { moving })) {
    const path =
      parentId === null ? [name] : [...ancestorsOf(tree, parentId).map((each) => each.name), name];
    const choice = {
      parentId,
      path,
      pathKey: searchKey(path.join(" › ")),
      nameKey: searchKey(name),
    };
    if (parentId === null) collection = choice;
    else choices.push(choice);
  }
  const folders = choices.toSorted(
    (a, b) => byBytes(a.pathKey, b.pathKey) || byBytes(a.parentId ?? "", b.parentId ?? ""),
  );
  return collection ? [collection, ...folders] : folders;
}

export type FolderSuggestions = {
  /** Collection, when it can take the item. */
  collection: FolderChoice | undefined;
  /** The folders last moved into, the latest first. */
  recent: FolderChoice[];
  /** Other folders by path, filling up to `suggestedCount`. */
  others: FolderChoice[];
  /** How many more folders there are to find by typing. */
  hidden: number;
};

/** What shows before anything is typed, `recent` being folder IDs, the latest first. */
export function folderSuggestions(
  choices: readonly FolderChoice[],
  recent: readonly string[],
): FolderSuggestions {
  const collection = choices.find((choice) => choice.parentId === null);
  const folders = choices.filter((choice) => choice.parentId !== null);
  const byId = new Map(folders.map((choice) => [choice.parentId, choice]));
  const latest = recent
    .flatMap((id) => byId.get(id) ?? [])
    .filter((choice, at, all) => all.indexOf(choice) === at)
    .slice(0, suggestedCount);
  const shown = new Set(latest);
  const others = folders
    .filter((choice) => !shown.has(choice))
    .slice(0, suggestedCount - latest.length);
  return {
    collection,
    recent: latest,
    others,
    hidden: folders.length - latest.length - others.length,
  };
}
