// Naming a folder or list in a share the person edits (DS-70 for editors; TON-191). The owner names them in the
// sidebar's tree, which keeps showing the person's own collection while a share is on screen, so a share's views ask
// for the name here: a new folder or list in the folder on view, or a new name for the one on view. The write is the
// share client's, optimistic like any other, and a refusal such as a taken name shows in the save states (DS-80).

import { sent } from "@/client/sync/writer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";

import {
  clipLength,
  maxNameLength,
  uuidv7,
  type Container,
  type ContainerKind,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Field } from "@tonaris/ui/components/field";
import { Input } from "@tonaris/ui/components/input";

export type Naming =
  | { mode: "new"; kind: ContainerKind; parentId: string; parentName: string }
  | { mode: "rename"; container: Pick<Container, "id" | "kind" | "name"> };

const NamingContext = createContext<(naming: Naming) => void>(() => {});

/** Asks for a name in a share: what the header's buttons and the shortcuts and palette open there (TON-195). */
export function useStartNaming(): (naming: Naming) => void {
  return useContext(NamingContext);
}

/** Holds the name dialog for what is below, on the collection on screen. */
export function NamingProvider({ children }: { children: ReactNode }) {
  const [naming, setNaming] = useState<Naming>();
  return (
    <NamingContext value={setNaming}>
      {children}
      <NameDialog naming={naming} onClose={() => setNaming(undefined)} />
    </NamingContext>
  );
}

export function NameDialog({
  naming,
  onClose,
}: {
  naming: Naming | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog open={naming !== undefined} onOpenChange={(open) => !open && onClose()}>
      {naming && (
        <DialogContent className="max-w-[440px]">
          <NameForm
            key={naming.mode === "new" ? `${naming.parentId}:${naming.kind}` : naming.container.id}
            naming={naming}
            onClose={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function NameForm({ naming, onClose }: { naming: Naming; onClose: () => void }) {
  const client = useSyncClient();
  const [name, setName] = useState(naming.mode === "rename" ? naming.container.name : "");
  const [problem, setProblem] = useState<string>();
  const kind = naming.mode === "new" ? naming.kind : naming.container.kind;
  const title =
    naming.mode === "new"
      ? `New ${kind} in "${naming.parentName}"`
      : `Rename "${naming.container.name}"`;

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setProblem("Enter a name.");
      return;
    }
    if (!client) return;
    if (naming.mode === "rename") {
      if (trimmed !== naming.container.name) {
        sent(
          client.containers.update(naming.container.id, (draft) => {
            draft.name = trimmed;
          }),
        );
      }
    } else {
      sent(
        client.containers.insert({
          id: uuidv7(),
          kind,
          parentId: naming.parentId,
          name: trimmed,
          description: null,
          color: null,
        }),
      );
    }
    onClose();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <Field label="Name" problem={problem}>
        {(control) => (
          <Input
            {...control}
            value={name}
            onChange={(event) => {
              setName(clipLength(event.target.value, maxNameLength));
              setProblem(undefined);
            }}
          />
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {naming.mode === "new" ? "Create" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  );
}
