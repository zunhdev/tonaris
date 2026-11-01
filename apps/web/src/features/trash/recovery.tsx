// Recovering folders and lists from Trash (DS-56; FR-01.14 to FR-01.16, TS-26). `useRecover()` returns a unit where
// it was when it can, and asks first when it can't:
// - **Destination:** its folder is in Trash or gone, so the owner chooses an active folder or the collection;
// - **Name:** its name is taken there, so the owner enters another, or chooses another place.
// Nothing changes until then, and cancelling changes nothing; the unit's expiry keeps running meanwhile. These are
// checked here against the collection the client holds, and again by the server, which answers `needs_input` if
// something changed meanwhile. Once recovered, "Restored 'Doom'", or "Restored · 2 memberships skipped" with Details
// listing each entry whose album is in Trash or gone for good. An album's restore that would make a second active
// record of the same album pauses (FR-14.3): both records are shown, and the owner keeps the active one, or deletes it
// into Trash, confirmed, and restores. A recovery that would make content visible to anyone asks first, showing to
// whom (DS-69, FR-07.14); choosing a destination previews it for the one chosen, and an Undo doesn't ask.

import type { Deleted, RecoveryChoice } from "@/client/sync/trash";
import { useCollectionData } from "@/features/collection/data";
import { nameRefusal } from "@/features/collection/editing";
import { PlaceList } from "@/features/collection/place-list";
import { destinations, siblingsOf } from "@/features/collection/tree";
import {
  readImpact,
  SharingImpactBlock,
  SharingImpactPreview,
} from "@/features/sharing/sharing-impact";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { z } from "zod";

import {
  findNameConflict,
  recoveryResultSchema,
  type SameAlbum,
  type SharingImpact,
  type SkippedEntry,
  type TrashUnitKind,
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

import { ConfirmDialog } from "../shell/confirm-dialog";
import { count } from "../shell/words";

/** A unit to recover: what it is, where it was, and, after a deletion just made, what that deletion took out. */
export type RecoveryTarget = {
  unitId: string;
  rootId: string;
  kind: TrashUnitKind;
  name: string;
  parentId: string | null;
  deleted?: Deleted;
};

type Prompt =
  | { step: "destination"; target: RecoveryTarget; choice: RecoveryChoice }
  | { step: "name"; target: RecoveryTarget; choice: RecoveryChoice; parentId: string | null }
  | { step: "skipped"; name: string; skipped: SkippedEntry[] }
  | { step: "same"; target: RecoveryTarget; active: SameAlbum }
  | {
      step: "sharing";
      target: RecoveryTarget;
      choice: RecoveryChoice;
      impact: SharingImpact | "failed";
    }
  | { step: "replace"; target: RecoveryTarget; active: SameAlbum };

const RecoveryContext = createContext<(target: RecoveryTarget) => void>(() => {});

/** Recovers a unit from Trash, asking for a destination or name when it must (DS-56). */
export function useRecover(): (target: RecoveryTarget) => void {
  return useContext(RecoveryContext);
}

export function RecoveryProvider({ children }: { children: ReactNode }) {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  const { tree } = useCollectionData();
  const [prompt, setPrompt] = useState<Prompt>();
  // The latest tree, for a recovery continued after a prompt.
  const latest = useRef(tree);
  useEffect(() => {
    latest.current = tree;
  });

  function send(target: RecoveryTarget, choice: RecoveryChoice) {
    if (!client) return;
    const { transaction, mutationId } = client.trash.recover(
      { unitId: target.unitId, rootId: target.rootId },
      choice,
      target.deleted,
    );
    const name = choice.name ?? target.name;
    announce(`Restored ${name}`);
    void (async () => {
      try {
        await transaction.isPersisted.promise;
      } catch {
        // A restore that would duplicate an active album asks here (FR-14.3), rather than in Activity.
        const asked = client.states.get(mutationId)?.outcome;
        const same =
          asked?.status === "needs_input" && asked.need === "match"
            ? sameAlbumSchema.safeParse(asked.candidates[0])
            : undefined;
        if (same?.success) {
          client.states.dismiss(mutationId);
          setPrompt({ step: "same", target, active: same.data });
        }
        // The save-state layer reports any other recovery that wasn't made.
        return;
      }
      const outcome = client.states.get(mutationId)?.outcome;
      const result =
        outcome?.status === "confirmed"
          ? recoveryResultSchema.safeParse(outcome.result)
          : undefined;
      const skipped = result?.success ? result.data.skipped : [];
      if (skipped.length === 0) {
        notify?.info(`Restored '${name}'`);
        return;
      }
      notify?.info(
        `Restored · ${count(skipped.length, "membership", "memberships")} skipped`,
        undefined,
        {
          label: "Details",
          onClick: () => setPrompt({ step: "skipped", name, skipped }),
        },
      );
    })();
  }

  /**
   * Recovers at once if nobody else would see it, or after an Undo; otherwise asks first, showing to whom (DS-69).
   * `to` is where a folder or list goes.
   */
  function checkSharing(target: RecoveryTarget, choice: RecoveryChoice, to?: string | null) {
    setPrompt(undefined);
    if (target.deleted) {
      send(target, choice);
      return;
    }
    readImpact({ recover: target.unitId, ...(to === undefined ? {} : { to }) }).then(
      (impact) => {
        if (impact.added.length === 0 && impact.direct.length === 0) send(target, choice);
        else setPrompt({ step: "sharing", target, choice, impact });
        return impact;
      },
      () => setPrompt({ step: "sharing", target, choice, impact: "failed" }),
    );
  }

  /** Recovers `target` with `choice`, or asks for what is missing first. */
  function proceed(target: RecoveryTarget, choice: RecoveryChoice) {
    // An album returns to its lists; there is no place or name to choose (FR-14.2).
    if (target.kind === "album") {
      checkSharing(target, {});
      return;
    }
    const now = latest.current;
    const parentId = choice.parentId === undefined ? target.parentId : choice.parentId;
    if (parentId !== null && now.byId.get(parentId)?.kind !== "folder") {
      setPrompt({ step: "destination", target, choice });
      return;
    }
    const name = choice.name ?? target.name;
    if (findNameConflict(name, siblingsOf(now, parentId))) {
      setPrompt({ step: "name", target, choice, parentId });
      return;
    }
    // A destination chosen in the prompt was previewed there.
    if (choice.parentId !== undefined) {
      setPrompt(undefined);
      send(target, choice);
      return;
    }
    checkSharing(target, choice, parentId);
  }

  // The latest `proceed`, so the context's function stays the same.
  const current = useRef(proceed);
  useEffect(() => {
    current.current = proceed;
  });
  const recover = useCallback((target: RecoveryTarget) => current.current(target, {}), []);

  return (
    <RecoveryContext value={recover}>
      {children}
      {prompt?.step === "destination" && (
        <DestinationPrompt
          target={prompt.target}
          onCancel={() => setPrompt(undefined)}
          onChoose={(parentId) => proceed(prompt.target, { ...prompt.choice, parentId })}
        />
      )}
      {prompt?.step === "name" && (
        <NamePrompt
          target={prompt.target}
          parentId={prompt.parentId}
          onCancel={() => setPrompt(undefined)}
          onElsewhere={() => setPrompt({ ...prompt, step: "destination" })}
          onName={(name) => proceed(prompt.target, { ...prompt.choice, name })}
        />
      )}
      {prompt?.step === "sharing" && (
        <SharingPrompt
          target={prompt.target}
          impact={prompt.impact}
          onCancel={() => setPrompt(undefined)}
          onRestore={() => {
            setPrompt(undefined);
            send(prompt.target, prompt.choice);
          }}
        />
      )}
      {prompt?.step === "same" && (
        <SameAlbumPrompt
          target={prompt.target}
          active={prompt.active}
          onKeep={() => setPrompt(undefined)}
          onReplace={() => setPrompt({ ...prompt, step: "replace" })}
        />
      )}
      <ConfirmDialog
        confirmation={
          prompt?.step === "replace"
            ? {
                title: `Delete '${prompt.active.title}' from your collection?`,
                scope: [
                  `The active '${prompt.active.title}', so '${prompt.target.name}' can come back.`,
                ],
                consequences: [
                  "Removes it from every list and Unsorted.",
                  "Recoverable from Trash for 30 days.",
                ],
                action: "Move to Trash and restore",
                onConfirm: () => {
                  if (!client) return;
                  client.trash
                    .deleteAlbum(prompt.active.albumId)
                    .transaction.isPersisted.promise.catch(() => {});
                  // Sent after the deletion, which the server applies first.
                  send(prompt.target, {});
                },
              }
            : undefined
        }
        onClose={() => setPrompt((shown) => (shown?.step === "replace" ? undefined : shown))}
      />
      {prompt?.step === "skipped" && (
        <SkipReport
          name={prompt.name}
          skipped={prompt.skipped}
          onClose={() => setPrompt(undefined)}
        />
      )}
    </RecoveryContext>
  );
}

/** "'Metal' is in Trash or no longer exists. Choose where to restore 'Doom'." (DS-56) */
function DestinationPrompt({
  target,
  onChoose,
  onCancel,
}: {
  target: RecoveryTarget;
  onChoose: (parentId: string | null) => void;
  onCancel: () => void;
}) {
  const client = useSyncClient();
  const { tree } = useCollectionData();
  // Collection and every active folder (DS-56).
  const places = destinations(tree);
  const [chosen, setChosen] = useState<string | null>(null);
  const formerName =
    target.parentId === null
      ? undefined
      : [...(client?.trashUnits.values() ?? [])].find((unit) => unit.rootId === target.parentId)
          ?.name;
  const former = formerName === undefined ? "Its folder" : `'${formerName}'`;

  function submit(event: FormEvent) {
    event.preventDefault();
    onChoose(chosen);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore '{target.name}'</DialogTitle>
          <DialogDescription>
            {former} is in Trash or no longer exists. Choose where to restore '{target.name}'.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <PlaceList mode="radios" places={places} chosen={chosen} onChange={setChosen} />
          <SharingImpactPreview query={{ recover: target.unitId, to: chosen }} />
          <DialogFooter>
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Restore
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Restore '{name}'?" when it would be visible to anyone: to whom (DS-69). */
function SharingPrompt({
  target,
  impact,
  onRestore,
  onCancel,
}: {
  target: RecoveryTarget;
  impact: SharingImpact | "failed";
  onRestore: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore '{target.name}'?</DialogTitle>
          <DialogDescription>
            {impact === "failed"
              ? "Who can see it once it's back couldn't be checked."
              : "Once it's back, others can see it."}
          </DialogDescription>
        </DialogHeader>
        <SharingImpactBlock impact={impact} />
        <DialogFooter>
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onRestore}>
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "'Collection' already has a list or folder named 'Doom'." with the name to change, selected (DS-56). */
function NamePrompt({
  target,
  parentId,
  onName,
  onElsewhere,
  onCancel,
}: {
  target: RecoveryTarget;
  parentId: string | null;
  onName: (name: string) => void;
  onElsewhere: () => void;
  onCancel: () => void;
}) {
  const { tree } = useCollectionData();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(target.name);
  const [problem, setProblem] = useState<string>();
  const destination = parentId === null ? "Collection" : (tree.byId.get(parentId)?.name ?? "");

  useEffect(() => {
    input.current?.select();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const refusal = nameRefusal(name, {
      siblings: siblingsOf(tree, parentId),
      parentName: parentId === null ? null : destination,
    });
    if (refusal) {
      setProblem(refusal);
      return;
    }
    onName(name.trim());
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent initialFocus={input}>
        <DialogHeader>
          <DialogTitle>Restore '{target.name}'</DialogTitle>
          <DialogDescription>
            '{destination}' already has a list or folder named '{target.name}'.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Field label="Name" problem={problem}>
              {(control) => (
                <Input
                  {...control}
                  ref={input}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setProblem(undefined);
                  }}
                />
              )}
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={onElsewhere}
            >
              Choose another location…
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Restore
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const reasons: Record<SkippedEntry["reason"], string> = {
  album_in_trash: "The album is in Trash",
  album_deleted: "The album was deleted permanently",
  list_in_trash: "The list is in Trash",
  list_deleted: "The list was deleted permanently",
};

/** Each entry recovery skipped, and why (DS-56). */
function SkipReport({
  name,
  skipped,
  onClose,
}: {
  name: string;
  skipped: SkippedEntry[];
  onClose: () => void;
}) {
  const { tree } = useCollectionData();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skipped while restoring '{name}'</DialogTitle>
          <DialogDescription>
            These albums weren't put back in their lists. Everything else was restored.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {skipped.map((entry) => {
            const list =
              entry.listName ??
              (entry.listId === null ? undefined : tree.byId.get(entry.listId)?.name);
            return (
              <li key={`${entry.listId ?? ""}:${entry.albumId}`} className="flex flex-col">
                <span className="text-fg-primary">
                  {entry.title} · {entry.artist}
                </span>
                <span className="text-small text-fg-secondary">
                  {reasons[entry.reason]}
                  {list === undefined ? "" : ` · was in '${list}'`}
                </span>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const sameAlbumSchema = z.object({
  unitId: z.string(),
  albumId: z.string(),
  title: z.string(),
  artistCredit: z.string(),
  originalYear: z.number().nullable(),
});

/** One of the two records a same-album pause shows. */
function RecordCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col rounded-md border border-subtle p-3">
      <span className="text-fg-primary">{title}</span>
      <span className="text-small text-fg-secondary">{detail}</span>
    </div>
  );
}

/** Both records, and the owner's choice: keep the active one, or delete it and restore (DS-56, FR-14.3). */
function SameAlbumPrompt({
  target,
  active,
  onKeep,
  onReplace,
}: {
  target: RecoveryTarget;
  active: SameAlbum;
  onKeep: () => void;
  onReplace: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onKeep()}>
      <DialogContent initialFocus={keep}>
        <DialogHeader>
          <DialogTitle>Restore '{target.name}'?</DialogTitle>
          <DialogDescription>
            '{active.title}' is already in your collection as the same album. Restoring would make
            two records of it, so nothing has changed: both stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <RecordCard title={target.name} detail="In Trash" />
          <RecordCard
            title={active.title}
            detail={[active.artistCredit, active.originalYear, "In your collection"]
              .filter(Boolean)
              .join(" · ")}
          />
        </div>
        <DialogFooter className="flex-wrap">
          <Button type="button" onClick={onKeep}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onReplace}>
            Delete the active album, then restore…
          </Button>
          <Button ref={keep} type="button" variant="primary" onClick={onKeep}>
            Keep the active album
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
