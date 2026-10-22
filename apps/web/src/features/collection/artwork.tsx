// Album artwork (DS-23): a fixed square that never shifts the layout. The fallback tile (artwork-tile.ts) shows the
// title's first letter on its hue whenever there is no artwork, while it loads, and if it fails, never as an error.
// An image fades in over it in 150 ms once loaded (DS-17). Decorative here: the title is beside it in rows and cards.

import { useState } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { artworkTile } from "./artwork-tile";

export function Artwork({
  title,
  src,
  className,
  letterClassName,
}: {
  title: string;
  /** The artwork's URL; albums carry none until capture (M3). */
  src?: string;
  /** Its size, as classes: `size-7` in rows, `w-full` in cards. */
  className?: string;
  letterClassName?: string;
}) {
  const tile = artworkTile(title);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden
      className={cn("relative block aspect-square shrink-0 overflow-hidden rounded-sm", className)}
      style={{ background: tile.background }}
    >
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-medium",
          letterClassName,
        )}
        style={{ color: tile.foreground }}
      >
        {tile.letter}
      </span>
      {src && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-150 ease-enter",
            loaded && "opacity-100",
          )}
        />
      )}
    </span>
  );
}
