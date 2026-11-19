// Folder and list icons (DS-27, DS-41), beside their names in the tree and the views' headers. With a color (TON-175),
// the icon is drawn in it and lightly filled with it, as Eagle's folders are. A folder's or list's own icon (TON-306)
// takes the glyph's place, for that folder or list only.

import { Folder, ListMusic } from "lucide-react";

import type { ContainerColor, ContainerIconName, ContainerKind } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { iconGlyphs } from "./container-glyphs";
import { iconColorClass } from "./container-palette";

export function ContainerIcon({
  kind,
  color = null,
  icon = null,
  className,
}: {
  kind: ContainerKind;
  /** Its own or its folder's color, null for none (`effectiveColor`). */
  color?: ContainerColor | null;
  /** Its own icon, null for the folder or list glyph. Never its folder's. */
  icon?: ContainerIconName | null;
  /** Its size, if not 16 px: a phone's two-line rows take 20 px (TON-184). */
  className?: string;
}) {
  const Icon = icon !== null ? iconGlyphs[icon] : kind === "folder" ? Folder : ListMusic;
  return (
    <Icon
      strokeWidth={1.5}
      aria-hidden
      data-color={color ?? undefined}
      data-icon={icon ?? undefined}
      className={cn(
        "size-4 shrink-0",
        color !== null && [iconColorClass[color], "fill-current/25"],
        className,
      )}
    />
  );
}
