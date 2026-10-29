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
import type { Tree } from "@/features/collection/tree";
import {
  readImpact,
  SharingImpactBlock,
  SharingImpactPreview,
} from "@/features/sharing/sharing-impact";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { FolderClosed, Library } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { z } from "zod";

import {
  containerNameProblem,
  findNameConflict,
  nameTakenProblem,
  recoveryResultSchema,
  type Container,
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
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Input } from "@tonaris/ui/components/input";

import { ConfirmDialog } from "../shell/confirm-dialog";

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

/** The siblings a recovered root would have under `parentId`. */
const siblingsUnder = (tree: Tree, parentId: string | null): Container[] =>
  parentId === null ? tree.roots : (tree.children.get(parentId) ?? []);

const albums = (n: number) => `${n} ${n === 1 ? "membership" : "memberships"}`;

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
      notify?.info(`Restored · ${albums(skipped.length)} skipped`, undefined, {
        label: "Details",
        onClick: () => setPrompt({ step: "skipped", name, skipped }),
      });
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
    if (findNameConflict(name, siblingsUnder(now, parentId))) {
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

/** The collection and every active folder, nested, as places to recover into. */
function places(tree: Tree): { parentId: string | null; name: string; level: number }[] {
  const found: { parentId: string | null; name: string; level: number }[] = [
    { parentId: null, name: "Collection", level: 0 },
  ];
  const walk = (siblings: readonly Container[], level: number) => {
    for (const folder of siblings) {
      if (folder.kind !== "folder") continue;
      found.push({ parentId: folder.id, name: folder.name, level });
      walk(tree.children.get(folder.id) ?? [], level + 1);
    }
  };
  walk(tree.roots, 1);
  return found;
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
  const options = places(tree);
  const [chosen, setChosen] = useState<string>("root");
  const group = useId();
  const formerName =
    target.parentId === null
      ? undefined
      : [...(client?.trashUnits.values() ?? [])].find((unit) => unit.rootId === target.parentId)
          ?.name;
  const former = formerName === undefined ? "Its folder" : `'${formerName}'`;

  function submit(event: FormEvent) {
    event.preventDefault();
    onChoose(chosen === "root" ? null : chosen);
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
          <fieldset aria-labelledby={group} className="flex max-h-80 flex-col overflow-y-auto">
            <legend id={group} className="sr-only">
              Places
            </legend>
            {options.map((place) => {
              const value = place.parentId ?? "root";
              const Icon = place.parentId === null ? Library : FolderClosed;
              return (
                <label
                  key={value}
                  className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-fg-primary hover:bg-hover has-[:checked]:bg-selected has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-solid"
                  style={{ paddingLeft: 8 + place.level * 16 }}
                >
                  <input
                    type="radio"
                    name="place"
                    value={value}
                    checked={chosen === value}
                    onChange={() => setChosen(value)}
                    className="sr-only"
                  />
                  <Icon
                    aria-hidden
                    strokeWidth={1.5}
                    className="size-4 shrink-0 text-fg-secondary"
                  />
                  <span className="truncate">{place.name}</span>
                </label>
              );
            })}
          </fieldset>
          <SharingImpactPreview
            query={{ recover: target.unitId, to: chosen === "root" ? null : chosen }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Restore
            </Button>
          </div>
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
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onRestore}>
            Restore
          </Button>
        </div>
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
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(target.name);
  const [problem, setProblem] = useState<string>();
  const destination = parentId === null ? "Collection" : (tree.byId.get(parentId)?.name ?? "");

  useEffect(() => {
    input.current?.select();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const invalid = containerNameProblem(trimmed);
    if (invalid) {
      setProblem(invalid.problem.detail);
      return;
    }
    const taken = findNameConflict(trimmed, siblingsUnder(tree, parentId));
    if (taken) {
      setProblem(
        nameTakenProblem(taken.name, parentId === null ? null : destination).problem.detail,
      );
      return;
    }
    onName(trimmed);
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
            <label htmlFor={id} className="text-small text-fg-secondary">
              Name
            </label>
            <Input
              ref={input}
              id={id}
              value={name}
              aria-invalid={problem !== undefined}
              aria-describedby={problem === undefined ? undefined : `${id}-problem`}
              onChange={(event) => {
                setName(event.target.value);
                setProblem(undefined);
              }}
            />
            {problem && (
              <p id={`${id}-problem`} className="text-small text-status-danger">
                {problem}
              </p>
            )}
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
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Restore
            </Button>
          </div>
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={onKeep}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onReplace}>
            Delete the active album, then restore…
          </Button>
          <Button ref={keep} type="button" variant="primary" onClick={onKeep}>
            Keep the active album
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
