// The places a folder or list can go, as "Move to…" and Trash's restore list them (DS-49, DS-56): Collection, then the
// folders, each indented to its level with its icon. As buttons, a place is chosen by a click or Enter, and ↑ and ↓
// move between them, as Tab does; as radios, one is chosen for the form around them to submit.

import { FolderClosed, Library } from "lucide-react";
import { useId, useRef, type KeyboardEvent } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import type { Destination } from "./tree";

type PlaceListProps = { places: readonly Destination[] } & (
  | {
      mode: "buttons";
      /** A place is focused or pointed at. */
      onFocus: (parentId: string | null) => void;
      onChoose: (parentId: string | null) => void;
    }
  | {
      mode: "radios";
      /** The place checked; null is Collection. */
      chosen: string | null;
      onChange: (parentId: string | null) => void;
    }
);

export function PlaceList(props: PlaceListProps) {
  return props.mode === "buttons" ? <PlaceButtons {...props} /> : <PlaceRadios {...props} />;
}

/** A place's icon and name. */
function PlaceName({ place }: { place: Destination }) {
  const Icon = place.parentId === null ? Library : FolderClosed;
  return (
    <>
      <Icon aria-hidden strokeWidth={1.5} className="size-4 shrink-0 text-fg-secondary" />
      <span className="truncate">{place.name}</span>
    </>
  );
}

const indent = (place: Destination) => ({ paddingLeft: 8 + place.level * 16 });

const row = "flex h-8 items-center gap-2 rounded-md px-2 text-fg-primary";

function PlaceButtons({ places, onFocus, onChoose }: Extract<PlaceListProps, { mode: "buttons" }>) {
  const list = useRef<HTMLUListElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...(list.current?.querySelectorAll("button") ?? [])];
    const at = buttons.findIndex((button) => button === document.activeElement);
    const next =
      event.key === "ArrowDown" ? Math.min(at + 1, buttons.length - 1) : Math.max(at - 1, 0);
    buttons[next]?.focus();
  }

  return (
    // The choices are buttons, so Tab and the arrows both move between them.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <ul
      ref={list}
      aria-label="Places"
      className="flex max-h-80 flex-col overflow-y-auto"
      onKeyDown={onKeyDown}
    >
      {places.map((place) => (
        <li key={place.parentId ?? "root"}>
          <button
            type="button"
            className={cn(
              row,
              "w-full text-left outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid",
            )}
            style={indent(place)}
            onFocus={() => onFocus(place.parentId)}
            onMouseEnter={() => onFocus(place.parentId)}
            onClick={() => onChoose(place.parentId)}
          >
            <PlaceName place={place} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PlaceRadios({ places, chosen, onChange }: Extract<PlaceListProps, { mode: "radios" }>) {
  const group = useId();
  return (
    <fieldset aria-labelledby={group} className="flex max-h-80 flex-col overflow-y-auto">
      <legend id={group} className="sr-only">
        Places
      </legend>
      {places.map((place) => {
        const value = place.parentId ?? "root";
        return (
          <label
            key={value}
            className={cn(
              row,
              "cursor-default hover:bg-hover has-[:checked]:bg-selected has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-solid",
            )}
            style={indent(place)}
          >
            <input
              type="radio"
              name="place"
              value={value}
              checked={chosen === place.parentId}
              onChange={() => onChange(place.parentId)}
              className="sr-only"
            />
            <PlaceName place={place} />
          </label>
        );
      })}
    </fieldset>
  );
}
