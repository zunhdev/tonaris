// The manual entry form (DS-47, FR-02.4): "New album", every album field in order, with custom fields shown as coming
// later (M4), the artwork's URL (FR-03.4), a link per service (FR-06.3), and a destination list. Title, artist and the applicable year are required (FR-02.6); fields are checked
// when left and on submit, each error shown at its field and, on submit, summarized at the top. Nothing incomplete is
// saved and nothing invented (AC-08). ⌘Enter saves; Esc or closing asks before discarding what was typed. Saving
// creates the album, then its links, then its entry in the list, through the collections, so save states apply; Edit
// on a failed save reopens it as it was entered. Opened from a capture, it says why, and either completes the capture
// with the album's details, the link kept, or adds the album with the pasted link in its field (DS-48).

import { shownLink } from "@/features/capture/outcomes";
import { useAnnounce } from "@/features/sync/announcer";
import { useSaveActions } from "@/features/sync/save-actions";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { streamingServices } from "@tonaris/domain";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tonaris/ui/components/alert-dialog";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { SegmentedControl, type SegmentedOption } from "@tonaris/ui/components/segmented-control";
import { Switch } from "@tonaris/ui/components/switch";
import { cn } from "@tonaris/ui/lib/utils";

import {
  albumOfForm,
  formProblems,
  isFormDirty,
  linksOfForm,
  type AlbumForm,
  type FormField,
} from "./album-form";
import { useCollectionUi, type NewAlbumDraft } from "./collection-ui";
import { FormFields } from "./form-fields";
import { useListOptions } from "./list-options";

const releaseTypeOptions: readonly SegmentedOption<"album" | "ep" | "compilation" | "unknown">[] = [
  { value: "album", label: "Album" },
  { value: "ep", label: "EP" },
  { value: "compilation", label: "Compilation" },
  { value: "unknown", label: "Unknown" },
];

const formFields: readonly FormField[] = [
  "title",
  "artistCredit",
  "originalYear",
  "recording",
  "artworkUrl",
  ...streamingServices,
];

const fieldNames: Record<FormField, string> = {
  title: "Title",
  artistCredit: "Artist",
  originalYear: "Original release year",
  recording: "Recording year or range",
  artworkUrl: "Artwork URL",
  spotify: "Spotify link",
  "apple-music": "Apple Music link",
  qobuz: "Qobuz link",
  tidal: "Tidal link",
};

/** The time an entry is made; the server records its own (TON-27). */
const now = () => new Date().toISOString();

export function NewAlbumDialog() {
  const { newAlbum, endNewAlbum } = useCollectionUi();
  // Each opening starts from its own draft.
  const [opened, setOpened] = useState(0);
  const [shown, setShown] = useState<NewAlbumDraft | undefined>(undefined);
  if (newAlbum !== shown) {
    setShown(newAlbum);
    if (newAlbum) setOpened((count) => count + 1);
  }
  return newAlbum ? <NewAlbumForm key={opened} draft={newAlbum} onDone={endNewAlbum} /> : null;
}

function NewAlbumForm({ draft, onDone }: { draft: NewAlbumDraft; onDone: () => void }) {
  const client = useSyncClient();
  const announce = useAnnounce();
  const actions = useSaveActions();
  const [form, setForm] = useState<AlbumForm>(draft.form);
  const [touched, setTouched] = useState<ReadonlySet<FormField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const summaryId = useId();
  const problems = formProblems(form);
  const shownProblems: Partial<Record<FormField, string>> = {};
  for (const field of formFields) {
    if (problems[field] && (submitted || touched.has(field)))
      shownProblems[field] = problems[field];
  }

  const lists = useListOptions();

  const set = (values: Partial<AlbumForm>) => setForm((current) => ({ ...current, ...values }));
  // The applied fields as their editors last saved them, so ⌘Enter from an editor saves its value too.
  const appliedFields = useRef(draft.form.fieldValues);
  const setFields = (fieldValues: AlbumForm["fieldValues"]) => {
    appliedFields.current = fieldValues;
    set({ fieldValues });
  };
  const touch = (field: FormField) =>
    setTouched((current) => (current.has(field) ? current : new Set([...current, field])));

  function requestClose() {
    if (isFormDirty(form)) setConfirming(true);
    else onDone();
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    setSubmitted(true);
    const album = albumOfForm(form);
    if (!album || !client) {
      // The first field with a problem takes the focus; the summary is announced.
      const first = formFields.find((field) => problems[field]);
      formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    if (draft.capture?.mode === "details") {
      // Completing a capture: it keeps the link, and the sources of the values left as offered (TS-15).
      // Capture's details are the album's fields; its artwork comes from the Cover Art Archive (TON-48).
      const { id: _, artworkUrl: __, ...details } = album;
      const capture = client.states.get(draft.capture.mutationId);
      if (capture) client.captures.again(capture, { details, listId: form.listId });
      else {
        client.captures.send([{ link: draft.capture.link, listId: form.listId, details }]);
      }
      announce(`Adding ${album.title}`);
      onDone();
      return;
    }
    client.albums.insert(album).isPersisted.promise.catch(() => {});
    // The links go after the album, in one transaction; the server reads each (TS-40).
    const links = linksOfForm(form, album.id);
    // Its custom fields follow it, applied with their values (FR-03.7).
    const values = appliedFields.current.map(({ fieldId, value }) => ({
      albumId: album.id,
      fieldId,
      value,
    }));
    if (values.length > 0) client.fieldValues.insert(values).isPersisted.promise.catch(() => {});
    if (links.length > 0) client.links.insert(links).isPersisted.promise.catch(() => {});
    if (form.listId !== null) {
      client.memberships
        .insert({ listId: form.listId, albumId: album.id, addedAt: now() })
        .isPersisted.promise.catch(() => {});
    }
    // The failed writes it makes again go, with their toasts.
    for (const id of draft.replaces ?? []) {
      const replaced = client.states.get(id);
      if (replaced) actions?.dismiss(replaced);
    }
    announce(`Added ${album.title}`);
    onDone();
  }

  const problemCount = Object.keys(problems).length;
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent className="max-w-[560px]" initialFocus={titleRef}>
          <DialogHeader>
            <DialogTitle>New album</DialogTitle>
            <DialogDescription>
              Title, artist and a year are required. Everything else can wait.
            </DialogDescription>
          </DialogHeader>
          {/* ⌘Enter submits from any field of the form (DS-47). */}
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <form
            ref={formRef}
            noValidate
            className="flex flex-col gap-4"
            onSubmit={submit}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
            }}
          >
            {draft.capture && (
              <p
                role="note"
                className="rounded-md border border-subtle bg-raised px-3 py-2 text-small text-fg-secondary"
              >
                {draft.capture.mode === "failed" && draft.capture.reason === ""
                  ? "We couldn't read this link — complete the details below."
                  : draft.capture.reason}
              </p>
            )}
            {submitted && problemCount > 0 && (
              <div
                id={summaryId}
                role="alert"
                className="rounded-md border border-status-danger px-3 py-2"
              >
                <p className="text-small text-status-danger">
                  {problemCount === 1 ? "Check 1 field:" : `Check ${problemCount} fields:`}{" "}
                  {formFields
                    .filter((field) => problems[field])
                    .map((field) => fieldNames[field])
                    .join(", ")}
                  .
                </p>
              </div>
            )}

            <TextField
              name="title"
              label="Title"
              required
              value={form.title}
              problem={shownProblems.title}
              onChange={(title) => set({ title })}
              onBlur={() => touch("title")}
              inputRef={titleRef}
            />
            <TextField
              name="artistCredit"
              label="Artist"
              required
              value={form.artistCredit}
              problem={shownProblems.artistCredit}
              onChange={(artistCredit) => set({ artistCredit })}
              onBlur={() => touch("artistCredit")}
            />

            <div className="flex items-end gap-4">
              <Labelled label="Release type" className="flex-1">
                {(id) => (
                  <SegmentedControl
                    aria-labelledby={id}
                    options={releaseTypeOptions}
                    value={form.releaseType ?? "unknown"}
                    onValueChange={(value) =>
                      set({ releaseType: value === "unknown" ? null : value })
                    }
                  />
                )}
              </Labelled>
              <Labelled label="Live">
                {(id) => (
                  <Switch
                    aria-labelledby={id}
                    checked={form.isLive}
                    onCheckedChange={(isLive) => set({ isLive })}
                    className="mb-1.5"
                  />
                )}
              </Labelled>
            </div>

            <p className="text-small text-fg-tertiary">
              Required: original release year — or, for live releases, the recording year or release
              year.
            </p>
            <TextField
              name="originalYear"
              label="Original release year"
              inputMode="numeric"
              value={form.originalYear}
              problem={shownProblems.originalYear}
              onChange={(originalYear) => set({ originalYear })}
              onBlur={() => touch("originalYear")}
            />
            {form.isLive && (
              <TextField
                name="recording"
                label="Recording year or range"
                placeholder="1978–1982"
                value={form.recording}
                problem={shownProblems.recording}
                onChange={(recording) => set({ recording })}
                onBlur={() => touch("recording")}
              />
            )}

            {draft.capture?.mode !== "details" && (
              <TextField
                name="artworkUrl"
                label="Artwork URL"
                type="url"
                placeholder="https://…"
                value={form.artworkUrl}
                problem={shownProblems.artworkUrl}
                onChange={(artworkUrl) => set({ artworkUrl })}
                onBlur={() => touch("artworkUrl")}
              />
            )}
            {draft.capture?.mode === "details" ? (
              <p className="text-small text-fg-secondary">
                The link is kept:{" "}
                <span className="text-fg-primary">{shownLink(draft.capture.link)}</span>
              </p>
            ) : (
              streamingServices.map((service) => (
                <TextField
                  key={service}
                  name={service}
                  label={fieldNames[service]}
                  type="url"
                  placeholder="Album or track link"
                  value={form.links[service]}
                  problem={shownProblems[service]}
                  onChange={(url) => set({ links: { ...form.links, [service]: url } })}
                  onBlur={() => touch(service)}
                />
              ))
            )}
            {draft.capture?.mode !== "details" && (
              <FormFields applied={form.fieldValues} onChange={setFields} />
            )}

            <Labelled label="List">
              {(id) => (
                <select
                  aria-labelledby={id}
                  value={form.listId ?? ""}
                  onChange={(event) => set({ listId: event.target.value || null })}
                  className="h-8 rounded-md border border-subtle bg-panel px-2 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
                >
                  <option value="">No list (goes to Unsorted)</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.label}
                    </option>
                  ))}
                </select>
              )}
            </Labelled>

            <div className="flex justify-end gap-2">
              <Button type="button" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" aria-keyshortcuts="Meta+Enter">
                Add album
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this album?</AlertDialogTitle>
            <AlertDialogDescription>What you entered isn't saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                onDone();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TextField({
  name,
  label,
  value,
  problem,
  required = false,
  onChange,
  onBlur,
  inputRef,
  ...rest
}: {
  name: FormField;
  label: string;
  value: string;
  problem: string | undefined;
  required?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  inputMode?: "numeric";
  type?: "url";
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small text-fg-secondary">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        value={value}
        required={required}
        aria-invalid={problem !== undefined}
        aria-describedby={problem === undefined ? undefined : `${id}-problem`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={cn(
          "h-8 rounded-md border border-subtle bg-panel px-2 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
          problem !== undefined && "border-status-danger",
        )}
        {...rest}
      />
      {problem !== undefined && (
        <p id={`${id}-problem`} className="text-small text-status-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

function Labelled({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={id} className="text-small text-fg-secondary">
        {label}
      </span>
      {children(id)}
    </div>
  );
}
