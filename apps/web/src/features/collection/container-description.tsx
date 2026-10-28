// A folder's or list's description under its header (DS-41; FR-03.5): plain text, its line breaks kept. Viewing mode
// shows it, or nothing without one. Editing mode makes it a text box, "Add a description" when empty: Enter or leaving
// it saves, Shift+Enter adds a line, Escape reverts, and leaving Editing mode saves it too (DS-45). Emptied, it is
// cleared. Over 2,000 characters it stays with its reason (X-05).

import { useSyncClient } from "@/features/sync/sync-provider";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { descriptionTooLong, maxDescriptionLength, type Container } from "@tonaris/domain";

import { useCollectionUi, useMode } from "./collection-ui";

// oxlint-disable-next-line no-misused-spread
const tooLong = (text: string) => [...text].length > maxDescriptionLength;

export function ContainerDescription({ container }: { container: Container }) {
  const { editing } = useMode();
  if (editing) return <DescriptionEditor key={container.id} container={container} />;
  if (!container.description) return null;
  return (
    <p className="max-h-24 shrink-0 overflow-y-auto px-6 pt-3 whitespace-pre-line text-fg-secondary">
      {container.description}
    </p>
  );
}

function DescriptionEditor({ container }: { container: Container }) {
  const client = useSyncClient();
  const { registerEditor } = useCollectionUi();
  const id = useId();
  const [draft, setDraftState] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const current = useRef<string | undefined>(undefined);
  const box = useRef<HTMLTextAreaElement>(null);
  const saved = container.description ?? "";
  const setDraft = (next: string | undefined) => {
    current.current = next;
    setDraftState(next);
  };

  const commit = useRef<() => boolean>(() => true);
  useEffect(() => {
    commit.current = () => {
      const typed = current.current;
      if (typed === undefined) return true;
      const text = typed.trim();
      if (tooLong(text)) {
        setProblem(descriptionTooLong);
        return false;
      }
      const next = text === "" ? null : text;
      if (next !== container.description && client) {
        // The save-state layer reports a write that fails.
        client.containers
          .update(container.id, (row) => {
            row.description = next;
          })
          .isPersisted.promise.catch(() => {});
      }
      setDraft(undefined);
      setProblem(undefined);
      return true;
    };
  });
  const open = draft !== undefined;
  useEffect(() => {
    if (!open) return undefined;
    return registerEditor(() => {
      const closed = commit.current();
      if (!closed) box.current?.focus();
      return closed;
    });
  }, [open, registerEditor]);

  function keys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commit.current();
    } else if (event.key === "Escape" && current.current !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(undefined);
      setProblem(undefined);
    }
  }

  const shown = draft ?? saved;
  return (
    <div className="flex shrink-0 flex-col gap-1 px-6 pt-3">
      <label htmlFor={id} className="sr-only">
        Description
      </label>
      <textarea
        ref={box}
        id={id}
        value={shown}
        placeholder="Add a description"
        rows={Math.min(6, Math.max(1, shown.split("\n").length))}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : `${id}-problem`}
        onFocus={() => {
          if (current.current === undefined) setDraft(saved);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(undefined);
        }}
        onBlur={() => commit.current()}
        onKeyDown={keys}
        className="-mx-2 max-w-3xl resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-fg-secondary outline-none placeholder:text-fg-tertiary hover:border-subtle focus-visible:border-strong focus-visible:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid aria-invalid:border-status-danger"
      />
      {problem && (
        <p id={`${id}-problem`} className="text-small text-status-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
