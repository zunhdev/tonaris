// Folder and list colors' pure parts (DS-27, TON-175): their names, their classes (written out, so Tailwind finds
// each), and the rule that a folder or list without its own color takes the nearest folder's above it.

import type { Container, ContainerColor } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

export const colorNames: Record<ContainerColor, string> = {
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
};

/** A colored icon's class: written out, so Tailwind finds each. */
export const iconColorClass: Record<ContainerColor, string> = {
  red: "text-folder-red",
  orange: "text-folder-orange",
  amber: "text-folder-amber",
  green: "text-folder-green",
  teal: "text-folder-teal",
  blue: "text-folder-blue",
  violet: "text-folder-violet",
  pink: "text-folder-pink",
};

const swatchClass: Record<ContainerColor, string> = {
  red: "bg-folder-red",
  orange: "bg-folder-orange",
  amber: "bg-folder-amber",
  green: "bg-folder-green",
  teal: "bg-folder-teal",
  blue: "bg-folder-blue",
  violet: "bg-folder-violet",
  pink: "bg-folder-pink",
};

/** A tinted chip's color (16A), as `--chip`, which `tintedChip` mixes into its ground and edge. */
const chipColorClass: Record<ContainerColor, string> = {
  red: "[--chip:var(--folder-red)]",
  orange: "[--chip:var(--folder-orange)]",
  amber: "[--chip:var(--folder-amber)]",
  green: "[--chip:var(--folder-green)]",
  teal: "[--chip:var(--folder-teal)]",
  blue: "[--chip:var(--folder-blue)]",
  violet: "[--chip:var(--folder-violet)]",
  pink: "[--chip:var(--folder-pink)]",
};

/** A list chip tinted with its color: a 16% ground over the panel and a 40% edge; its text stays `fg.primary`. */
export function tintedChip(color: ContainerColor | null): string | undefined {
  return color === null
    ? undefined
    : cn(
        chipColorClass[color],
        "border-[color:color-mix(in_oklch,var(--chip)_40%,transparent)] bg-[color:color-mix(in_oklch,var(--chip)_16%,var(--bg-panel))]",
      );
}

/** Its own color, or the nearest folder's above it; null when none of them has one. */
export function effectiveColor(
  container: Pick<Container, "color" | "parentId">,
  byId: ReadonlyMap<string, Pick<Container, "color" | "parentId">>,
): ContainerColor | null {
  let at: Pick<Container, "color" | "parentId"> | undefined = container;
  // A parent cycle can't be saved, but the walk stops after the tree's depth limit anyway.
  for (let step = 0; at && step < 64; step++) {
    if (at.color !== null) return at.color;
    at = at.parentId === null ? undefined : byId.get(at.parentId);
  }
  return null;
}

/** The round swatch of a color, or an empty ring for none. */
export function ColorSwatch({ color }: { color: ContainerColor | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-3 shrink-0 rounded-full",
        color === null ? "border border-strong" : swatchClass[color],
      )}
    />
  );
}
