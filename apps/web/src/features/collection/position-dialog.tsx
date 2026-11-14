// "Move to position…" (DS-49, TON-230): from the palette, in a view in manual order, a number moves the focused album,
// folder or list to that position among the items it moves among (its group's albums, when grouped), as ⌥↑ and ⌥↓
// move it by one: written as the view's order (TS-16) and announced (DS-83). Rearranging is presentation, so it needs
// no Editing mode and works offline (X-04). Each view registers its moves (`usePositioner`) for the command to use.

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";

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

import { useCollectionDialogs } from "./collection-dialogs";
import { useCollectionUi } from "./collection-ui";
import type { Standing, ViewMoves } from "./use-rearrange";

/** Makes `moves` the view on screen's, for "Move to position…", while the view is shown. */
export function usePositioner(moves: ViewMoves): void {
  const { setPositioner } = useCollectionUi();
  useEffect(() => setPositioner(moves), [setPositioner, moves]);
}

export function PositionDialog() {
  const { positioning, endPositioning } = useCollectionDialogs();
  const { positioner } = useCollectionUi();
  const field = useRef<HTMLInputElement>(null);
  const moves = positioning === undefined ? undefined : positioner();
  const standing = positioning === undefined ? undefined : moves?.standing(positioning);

  return (
    <Dialog
      open={standing !== undefined}
      onOpenChange={(open) => {
        if (!open) endPositioning();
      }}
    >
      <DialogContent initialFocus={field}>
        {positioning !== undefined && moves && standing && (
          // Keyed, so each opening starts with an empty field.
          <PositionForm
            key={positioning}
            id={positioning}
            standing={standing}
            moves={moves}
            field={field}
            onDone={endPositioning}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PositionForm({
  id,
  standing,
  moves,
  field,
  onDone,
}: {
  id: string;
  standing: Standing;
  moves: ViewMoves;
  field: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = value.trim();
    const position = Number(text);
    if (!/^\d+$/.test(text) || position < 1 || position > standing.total) {
      setProblem(`Enter a whole number from 1 to ${standing.total}.`);
      return;
    }
    // Where it stands already, there is nothing to move.
    if (position !== standing.position) moves.moveTo(id, position);
    onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Move '{standing.name}' to position</DialogTitle>
        <DialogDescription>
          It's at {standing.position} of {standing.total}.
        </DialogDescription>
      </DialogHeader>
      <Field label="Position" hint={`From 1 to ${standing.total}`} problem={problem}>
        {(control) => (
          <Input
            {...control}
            ref={field}
            inputMode="numeric"
            autoComplete="off"
            value={value}
            className="w-24"
            onChange={(event) => {
              setValue(event.target.value);
              setProblem(undefined);
            }}
          />
        )}
      </Field>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Move
        </Button>
      </DialogFooter>
    </form>
  );
}
