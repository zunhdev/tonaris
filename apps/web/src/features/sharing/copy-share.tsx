// "Copy to my collection…" (FR-07.22, DS-70; TON-133): in a folder or list shared with the person, on a computer,
// a dialog to copy it into their own collection. "Find a folder" picks Collection or one of their folders, as Move
// to… does; the dialog then reads what the copy adds there (`GET /v1/shared/{id}/copy`): the folders, lists and
// albums, how many albums are theirs already, the fields it creates or doesn't copy, and any limit it would exceed,
// when Copy stays off (all or nothing). A name taken there is asked about in the dialog, never changed on its own
// (X-06). Copying is `share.copy`, sent at once; the copy arrives through the person's stream, and a toast opens it.

import { api } from "@/api";
import { useNarrowScreen } from "@/common/media";
import { useCollectionData } from "@/features/collection/data";
import { FolderFinder } from "@/features/collection/folder-finder";
import { folderChoices } from "@/features/collection/folder-picker";
import { OwnCollection } from "@/features/collection/own-collection";
import { useNotify } from "@/features/sync/notify";
import { unreachable } from "@/features/sync/problems";
import { useConnection } from "@/features/sync/sync-provider";
import { useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  copySummary,
  findNameConflict,
  uuidv7,
  type ContainerKind,
  type ShareCopyPreview,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Field } from "@tonaris/ui/components/field";
import { Input } from "@tonaris/ui/components/input";

import { failureOf, sendNow } from "./send";

type Shared = { id: string; name: string; kind: ContainerKind };

/** The header's button and its dialog, on a computer; phones view only (X-04). */
export function CopyShareButton({ shared }: { shared: Shared }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const narrow = useNarrowScreen();
  const offline = useConnection() === "offline";
  if (narrow) return null;
  return (
    <>
      <Button variant="ghost" disabled={offline} onClick={() => setOpen(true)}>
        <Copy strokeWidth={1.5} aria-hidden />
        Copy to my collection…
      </Button>
      {/* The person's own folders and their writes, whatever share is on screen (TON-191). */}
      <OwnCollection>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent initialFocus={field} className="max-w-lg">
            {open && <CopyForm shared={shared} field={field} onDone={() => setOpen(false)} />}
          </DialogContent>
        </Dialog>
      </OwnCollection>
    </>
  );
}

function CopyForm({
  shared,
  field,
  onDone,
}: {
  shared: Shared;
  field: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const { tree } = useCollectionData();
  const notify = useNotify();
  const navigate = useNavigate();
  const choices = useMemo(() => folderChoices(tree), [tree]);
  const [to, setTo] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState(shared.name);
  // What it adds where it would go, read again for each place chosen; "reading" until that place's answer comes.
  const [read, setRead] = useState<{ to: string | null; preview: ShareCopyPreview | "failed" }>();
  const preview = to === undefined ? undefined : read?.to === to ? read.preview : "reading";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (to === undefined) return undefined;
    let current = true;
    void api.v1
      .shared({ id: shared.id })
      .copy.get({ query: { to: to ?? "root" } })
      .then(
        ({ data }) => {
          if (current) setRead({ to, preview: data ?? "failed" });
          return undefined;
        },
        () => {
          if (current) setRead({ to, preview: "failed" });
          return undefined;
        },
      );
    return () => {
      current = false;
    };
  }, [shared.id, to]);

  const siblings = to === undefined ? [] : to === null ? tree.roots : (tree.children.get(to) ?? []);
  const taken = findNameConflict(name, siblings);
  const destination =
    to === undefined ? undefined : to === null ? "Collection" : tree.byId.get(to)?.name;
  const ready =
    to !== undefined &&
    typeof preview === "object" &&
    preview.problems.length === 0 &&
    name.trim() !== "" &&
    !taken;

  async function copy() {
    if (!ready || to === undefined) return;
    setBusy(true);
    setError(undefined);
    const copyId = uuidv7();
    let reason: string | undefined;
    try {
      reason = failureOf(
        await sendNow({
          name: "share.copy",
          args: { containerId: shared.id, copyId, parentId: to, name: name.trim() },
        }),
      );
    } catch {
      reason = unreachable;
    }
    setBusy(false);
    if (reason) {
      setError(reason);
      return;
    }
    onDone();
    notify?.info(`Copied '${name.trim()}' to your collection`, undefined, {
      label: "Open",
      onClick: () =>
        void (shared.kind === "folder"
          ? navigate({ to: "/f/$folderId", params: { folderId: copyId } })
          : navigate({ to: "/l/$listId", params: { listId: copyId } })),
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Copy '{shared.name}' to your collection</DialogTitle>
        <DialogDescription>
          The copy is yours: it has everything inside, now, and no link to the original. Albums you
          have already join its lists instead of being copied twice.
        </DialogDescription>
      </DialogHeader>
      <FolderFinder choices={choices} field={field} chosen={to} onChoose={setTo} />
      {to !== undefined && (
        <div className="flex flex-col gap-3">
          <Field
            label="Name"
            problem={
              taken
                ? `'${taken.name}' already exists ${to === null ? "at the top level" : `in ${destination ?? "this folder"}`}. Choose another name.`
                : undefined
            }
          >
            {(control) => (
              <Input
                {...control}
                value={name}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>
          <output aria-label="What it adds" className="flex flex-col gap-1 text-fg-secondary">
            {preview === "reading" && <span>Checking what it adds…</span>}
            {preview === "failed" && <span>What it adds couldn't be checked. Try again.</span>}
            {typeof preview === "object" && (
              <>
                <span>It adds {copySummary(preview)}.</span>
                {preview.fields > 0 && (
                  <span>
                    It creates{" "}
                    {preview.fields === 1 ? "1 custom field" : `${preview.fields} custom fields`} of
                    yours.
                  </span>
                )}
                {preview.skippedFields.map((each) => (
                  <span key={each}>'{each}' isn't copied: yours is another kind of field.</span>
                ))}
                {preview.problems.map((problem) => (
                  <span key={problem} className="text-status-danger">
                    {problem} Nothing can be copied.
                  </span>
                ))}
              </>
            )}
          </output>
        </div>
      )}
      {error && (
        <p role="alert" className="text-status-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!ready || busy} onClick={() => void copy()}>
          Copy
        </Button>
      </DialogFooter>
    </>
  );
}
