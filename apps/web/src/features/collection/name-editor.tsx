// The inline editor naming a new folder or list, or renaming one, as a row of the sidebar tree (FR-01.1, FR-01.3,
// DS-78). Enter saves and Escape cancels; leaving the field saves a name, or cancels a blank one. A name the domain
// would refuse (blank, too long, or taken among its siblings) keeps the editor open with the reason, and nothing is
// sent (X-05, DS-107). Saving goes through the collection like any edit, so save states apply (DS-80); an editor
// opened by Edit on a failed write dismisses that failure once it saves.

import { useSaveActions } from "@/features/sync/save-actions";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useId, useRef, useState } from "react";

import { uuidv7, type ContainerKind } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionData } from "./data";
import { nameRefusal, type Editor } from "./editing";
import { ContainerIcon } from "./icons";

export function NameEditor({
  level,
  kind,
  parentId,
  editor,
  onClose,
}: {
  level: number;
  kind: ContainerKind;
  parentId: string | null;
  editor: Editor | undefined;
  /** Closes the editor; `focus` names the row to focus next, such as the one saved. */
  onClose: (focus?: string) => void;
}) {
  const client = useSyncClient();
  const actions = useSaveActions();
  const data = useCollectionData();
  const [name, setName] = useState(editor?.name ?? "");
  const [refusal, setRefusal] = useState<string>();
  const closed = useRef(false);
  const errorId = useId();
  if (!editor) return null;

  const renaming = editor.mode === "rename" ? data.tree.byId.get(editor.id) : undefined;
  const label =
    editor.mode === "rename"
      ? `New name for '${renaming?.name ?? editor.name}'`
      : `Name of the new ${kind}`;

  function close(focus?: string) {
    if (closed.current) return;
    closed.current = true;
    onClose(focus);
  }

  /** Saves the name, or shows why it can't be used; whether the editor closed. */
  function save(): boolean {
    if (!client || !editor) return false;
    const siblings = parentId === null ? data.tree.roots : (data.tree.children.get(parentId) ?? []);
    const parentName = parentId === null ? null : (data.tree.byId.get(parentId)?.name ?? null);
    const reason = nameRefusal(name, {
      siblings,
      parentName,
      ...(editor.mode === "rename" ? { selfId: editor.id } : {}),
    });
    if (reason) {
      setRefusal(reason);
      return false;
    }
    const trimmed = name.trim();
    let saved: string;
    if (editor.mode === "create") {
      saved = uuidv7();
      sent(client.containers.insert({ id: saved, kind, parentId, name: trimmed }));
    } else {
      saved = editor.id;
      if (renaming && renaming.name !== trimmed) {
        sent(
          client.containers.update(editor.id, (draft) => {
            draft.name = trimmed;
          }),
        );
      }
    }
    const replaced = editor.replaces === undefined ? undefined : client.states.get(editor.replaces);
    if (replaced) actions?.dismiss(replaced);
    close(saved);
    return true;
  }

  function cancel() {
    close(editor?.mode === "rename" ? editor.id : (parentId ?? undefined));
  }

  return (
    <div
      role="treeitem"
      aria-label={label}
      aria-level={level}
      aria-selected={false}
      className="flex min-w-0 flex-col gap-0.5 py-0.5 pr-2"
      style={{ paddingLeft: `${4 + (level - 1) * 12}px` }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-3.5 shrink-0" />
        <ContainerIcon kind={kind} />
        <input
          // The editor opens where the person asked for it, so it takes the focus.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label={label}
          aria-invalid={refusal !== undefined}
          aria-describedby={refusal === undefined ? undefined : errorId}
          value={name}
          maxLength={400}
          onChange={(event) => {
            setName(event.target.value);
            setRefusal(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          onBlur={() => {
            if (name.trim() === "") cancel();
            else save();
          }}
          className={cn(
            "h-6 min-w-0 flex-1 rounded-sm border border-strong bg-panel px-1.5 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
            refusal !== undefined && "border-status-danger",
          )}
        />
      </div>
      {refusal !== undefined && (
        <p id={errorId} className="pl-9 text-small text-status-danger">
          {refusal}
        </p>
      )}
    </div>
  );
}

/** The write reports its own outcome in the save states; a rejection is expected there, not here. */
function sent(transaction: { isPersisted: { promise: Promise<unknown> } }): void {
  transaction.isPersisted.promise.catch(() => {});
}
