// The List field of "Add albums" and "New album" (DS-47, DS-48): where the albums go, chosen before adding. There can
// be thousands of lists (TON-181), so rather than a select of them all, it is a button with the chosen list's path, or
// "No list (goes to Unsorted)", opening a popover that finds lists as "Add to a list" does (`ListFinder`). The
// popover is on the dialog's layer (DS-18), at the button's width, and Esc closes only it.

import { ChevronDown } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { Field } from "@tonaris/ui/components/field";
import { controlClass } from "@tonaris/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@tonaris/ui/components/popover";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionData } from "./data";
import { ListFinder } from "./list-finder";
import { listChoices } from "./list-picker";
import { useCollectionPlace } from "./place";
import { ancestorsOf } from "./tree";

const noList = "No list (goes to Unsorted)";
/** In a share, an album goes in one of its lists: there's no Unsorted of the person's there (TON-191). */
const shareList = "Choose a list in this share";

export function ListField({
  listId,
  onChange,
}: {
  /** The chosen list's ID, or null for none. */
  listId: string | null;
  onChange: (listId: string | null) => void;
}) {
  const { tree } = useCollectionData();
  const inShare = useCollectionPlace().kind === "share";
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const popupId = useId();
  const list = listId === null ? undefined : tree.byId.get(listId);
  const path =
    list && [...ancestorsOf(tree, list.id).map((folder) => folder.name), list.name].join(" › ");

  // ↓ opens it, as it does a select; Enter and Space do as on any button.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <Field label="List">
      {(control) => (
        <Popover open={open} onOpenChange={setOpen}>
          {/* A select can't hold "Find a list": this is APG's select-only combobox, a button opening a popup. */}
          <PopoverTrigger
            {...control}
            type="button"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="combobox"
            aria-expanded={open}
            aria-controls={popupId}
            onKeyDown={onKeyDown}
            className={cn(controlClass, "flex h-8 w-full items-center gap-2 text-left")}
          >
            <span className="min-w-0 flex-1 truncate">
              {path ?? (inShare ? shareList : noList)}
            </span>
            <ChevronDown
              strokeWidth={1.5}
              aria-hidden
              className="size-4 shrink-0 text-fg-tertiary"
            />
          </PopoverTrigger>
          <PopoverContent
            id={popupId}
            inDialog
            initialFocus={field}
            aria-label="Choose a list"
            className="w-(--anchor-width) p-2"
          >
            <Finder
              field={field}
              inShare={inShare}
              listId={list ? listId : null}
              onChoose={(chosen) => {
                onChange(chosen);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </Field>
  );
}

/** The popover's finder, made on each opening, so it starts with an empty field. */
function Finder({
  field,
  inShare,
  listId,
  onChoose,
}: {
  field: RefObject<HTMLInputElement | null>;
  inShare: boolean;
  listId: string | null;
  onChoose: (listId: string | null) => void;
}) {
  const { tree } = useCollectionData();
  const choices = useMemo(() => listChoices(tree, []), [tree]);
  return (
    <ListFinder
      choices={choices}
      field={field}
      none={inShare ? undefined : noList}
      chosen={listId}
      onChoose={(chosen) => onChoose(chosen?.id ?? null)}
    />
  );
}
