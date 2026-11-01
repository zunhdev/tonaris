// The capture dialog (DS-48; FR-02.1, FR-02.2, FR-02.4): `C` or "+ Add album" opens "Add albums", which takes one link
// per line and a destination: the list on view, another list, or none, so the albums go to Unsorted. Add, or ⌘Enter,
// captures each line; a line that isn't a link gets its reason in its row, as a paste's would. "Enter manually" opens
// the manual entry form for the same destination instead (DS-47).

import { emptyForm } from "@/features/collection/album-form";
import { useCollectionUi } from "@/features/collection/collection-ui";
import { useListOptions } from "@/features/collection/list-options";
import { CapacityNotice } from "@/features/settings/usage";
import { useId, useRef, useState, type FormEvent } from "react";

import { maxBatchItems } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { cn } from "@tonaris/ui/lib/utils";

import { useCapture } from "./capture-context";
import { linesIn } from "./links-in";

export function CaptureDialog() {
  const ui = useCapture();
  // Each opening starts empty.
  const [opened, setOpened] = useState(0);
  const [shown, setShown] = useState(ui?.dialog);
  if (ui?.dialog !== shown) {
    setShown(ui?.dialog);
    if (ui?.dialog) setOpened((count) => count + 1);
  }
  return ui?.dialog ? <CaptureForm key={opened} listId={ui.dialog.listId} /> : null;
}

function CaptureForm({ listId: initialList }: { listId: string | null }) {
  const ui = useCapture();
  const { startNewAlbum } = useCollectionUi();
  const lists = useListOptions();
  const [text, setText] = useState("");
  const [listId, setListId] = useState(initialList);
  const [problem, setProblem] = useState<string>();
  const linksRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const lines = linesIn(text);
    if (lines.length === 0) {
      setProblem("Paste at least one Spotify, Apple Music, Qobuz, Tidal or YouTube Music link.");
      linksRef.current?.focus();
      return;
    }
    // At most one batch at once (TS-25).
    if (lines.length > maxBatchItems) {
      setProblem(`Add up to ${maxBatchItems} links at once.`);
      linksRef.current?.focus();
      return;
    }
    if (ui?.capture(lines, listId)) ui.closeDialog();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) ui?.closeDialog();
      }}
    >
      <DialogContent className="max-w-[560px]" initialFocus={linksRef}>
        <DialogHeader>
          <DialogTitle>Add albums</DialogTitle>
          <DialogDescription>
            Paste Spotify, Apple Music, Qobuz, Tidal or YouTube Music album or track links.
          </DialogDescription>
        </DialogHeader>
        <CapacityNotice />
        {/* ⌘Enter adds from any field (DS-47, DS-78). */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-links`} className="text-small text-fg-secondary">
              Links
            </label>
            <textarea
              ref={linksRef}
              id={`${id}-links`}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              placeholder="One link per line"
              aria-invalid={problem !== undefined}
              aria-describedby={problem === undefined ? undefined : `${id}-problem`}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setProblem(undefined);
              }}
              className={cn(
                "min-h-24 rounded-md border border-subtle bg-panel px-2 py-1.5 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
                problem !== undefined && "border-status-danger",
              )}
            />
            {problem !== undefined && (
              <p id={`${id}-problem`} className="text-small text-status-danger">
                {problem}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-list`} className="text-small text-fg-secondary">
              List
            </label>
            <select
              id={`${id}-list`}
              value={listId ?? ""}
              onChange={(event) => setListId(event.target.value || null)}
              className="h-8 rounded-md border border-subtle bg-panel px-2 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
            >
              <option value="">No list (goes to Unsorted)</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                ui?.closeDialog();
                startNewAlbum({ form: emptyForm(listId) });
              }}
            >
              Enter manually
            </Button>
            <div className="flex gap-2">
              <Button type="button" onClick={() => ui?.closeDialog()}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" aria-keyshortcuts="Meta+Enter">
                Add
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
