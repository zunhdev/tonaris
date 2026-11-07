// A folder's or list's cover fan (DS-41, TON-174): its first three covers fanned out, the first in front at the
// bottom left, each behind it a step up and to the right and dimmer; one or two are centred the same way. The step
// is 6% of the box and the covers 88%, so a strip of each cover behind shows and the fan fills the box (TON-178).
// An empty one shows its folder or list icon on a tile. Positioned by classes only, so a server-rendered page, whose
// CSP refuses style attributes, draws it too (TON-126). The caller gives it a square, `relative` box.

import { Folder, ListMusic } from "lucide-react";

import type { ContainerKind } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { Artwork } from "./artwork";

export type FanCover = { id: string; title: string; src: string | undefined };

/** Each cover's place and shade, back to front, for one, two or three covers. */
const places: readonly (readonly string[])[] = [
  ["left-[6%] top-[6%]"],
  ["left-[9%] top-[3%] brightness-75", "left-[3%] top-[9%]"],
  ["left-[12%] top-0 brightness-50", "left-[6%] top-[6%] brightness-75", "left-0 top-[12%]"],
];

export function CoverFan({ covers, kind }: { covers: readonly FanCover[]; kind: ContainerKind }) {
  const shown = covers.slice(0, 3);
  if (shown.length === 0) {
    const Icon = kind === "folder" ? Folder : ListMusic;
    return (
      <span
        aria-hidden
        data-slot="cover-fan-empty"
        className="absolute inset-0 flex items-center justify-center rounded-md bg-raised text-fg-tertiary shadow-artwork"
      >
        <Icon strokeWidth={1.5} className="size-8" />
      </span>
    );
  }
  const backToFront = shown.toReversed();
  const layout = places[shown.length - 1] ?? [];
  return backToFront.map((cover, index) => (
    <span
      key={cover.id}
      aria-hidden
      data-slot="cover-fan-cover"
      className={cn("absolute w-[88%]", layout[index])}
    >
      <Artwork
        title={cover.title}
        src={cover.src}
        raised
        className="w-full rounded-md"
        letterClassName="text-display"
      />
    </span>
  ));
}
