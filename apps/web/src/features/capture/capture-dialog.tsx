// The capture dialog (DS-48; FR-02.1, FR-02.2, FR-02.4): `C` or "+ Add album" opens "Add albums", which takes one link
// per line and a destination: the list on view, another list, or none, so the albums go to Unsorted. Add, or ⌘Enter,
// captures each line; a line that isn't a link gets its reason in its row, as a paste's would. "Enter manually" opens
// the manual entry form for the same destination instead (DS-47).

import { emptyForm } from "@/features/collection/album-form";
import { useCollectionUi } from "@/features/collection/collection-ui";
import { useListOptions } from "@/features/collection/list-options";
import { CapacityNotice } from "@/features/settings/usage";
import { useRef, useState, type FormEvent } from "react";

import { maxBatchItems } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Field } from "@tonaris/ui/components/field";
import { Select } from "@tonaris/ui/components/select";
import { Textarea } from "@tonaris/ui/components/textarea";

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
          <Field label="Links" problem={problem}>
            {(control) => (
              <Textarea
                {...control}
                ref={linksRef}
                rows={5}
                spellCheck={false}
                autoComplete="off"
                placeholder="One link per line"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setProblem(undefined);
                }}
                className="min-h-24"
              />
            )}
          </Field>

          <Field label="List">
            {(control) => (
              <Select
                {...control}
                value={listId ?? ""}
                onChange={(event) => setListId(event.target.value || null)}
              >
                <option value="">No list (goes to Unsorted)</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

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
