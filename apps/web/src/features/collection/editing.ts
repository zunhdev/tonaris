// Creating and renaming folders and lists in the sidebar (FR-01.1, FR-01.3, DS-78): one inline editor at a time,
// started by N, ⇧N, the "+" menu, F2, or Edit on a failed write (DS-80). A new folder or list goes into the
// focused folder, or the current view's, or the root. Names are checked with the domain's own rules before
// anything is sent, so a refused name keeps the editor open with the same words the server would use (DS-107,
// X-05).

import {
  containerNameProblem,
  findNameConflict,
  nameTakenProblem,
  type Container,
  type ContainerKind,
} from "@tonaris/domain";

export type Editor =
  | {
      mode: "create";
      kind: ContainerKind;
      parentId: string | null;
      name: string;
      /** The failed write this one makes again; dismissed once the editor commits. */
      replaces?: string;
    }
  | { mode: "rename"; id: string; name: string; replaces?: string };

export type Editing = ReturnType<typeof createEditing>;

/** The open editor, if any, for the tree to show and the save-state layer to start. */
export function createEditing() {
  let editor: Editor | undefined;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    get current(): Editor | undefined {
      return editor;
    },
    start(next: Editor): void {
      editor = next;
      changed();
    },
    stop(): void {
      if (!editor) return;
      editor = undefined;
      changed();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Where a new folder or list goes (DS-78): into the focused tree item's folder (the folder itself, or a list's
 * parent), or else the current view's, or the root.
 */
export function placeFor(
  focused: Container | undefined,
  view: Container | undefined,
): string | null {
  const from = focused ?? view;
  if (!from) return null;
  return from.kind === "folder" ? from.id : from.parentId;
}

/**
 * Why `name` can't name a folder or list among `siblings`, in the domain's words, or undefined if it can. The one
 * being renamed (`selfId`) never collides with itself. `parentName` is its folder's, or null at the top level.
 */
export function nameRefusal(
  name: string,
  {
    siblings,
    selfId,
    parentName,
  }: { siblings: readonly Container[]; selfId?: string; parentName: string | null },
): string | undefined {
  const trimmed = name.trim();
  const problem = containerNameProblem(trimmed);
  if (problem) return problem.problem.detail;
  const taken = findNameConflict(trimmed, siblings, selfId);
  return taken && nameTakenProblem(taken.name, parentName).problem.detail;
}
